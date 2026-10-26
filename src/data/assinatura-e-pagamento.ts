import "server-only";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  max,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { db } from "@/lib/db";
import {
  arquivosDoFechamento,
  clientes,
  conversas,
  documentosDoCliente,
  type Etapa,
  empreendimentos,
  incorporadoras,
  lembretesDeEtapasFinais,
  lotes,
  mensagens,
  negocioEtapas,
  negocios,
  pendencias,
  propostas,
  reservas,
  type TipoDeArquivoDoFechamento,
  whatsappConexoes,
} from "@/lib/db/schema";
import { FUSO, partesEmBrasilia, somarDias } from "@/lib/fuso";
import * as storage from "@/lib/storage";
import * as whatsapp from "@/lib/whatsapp";
import { contextoDoNegocio, enviarTextoAoCliente } from "./assistente/contexto";
import { naJanelaDeEnvio } from "./cadencia";
import { LoteIndisponivelError } from "./coleta-de-dados";
import {
  mudarEtapa,
  type NegocioDoCorretor,
  negocioDoCorretor,
} from "./negocios";
import { criarPendencia } from "./pendencias";
import { calcularPlanoParaLote } from "./planos-de-pagamento";
import { reais, SemWhatsappError } from "./propostas";
import type { Session } from "./session";

// Assinatura, pagamento e Ganho (ticket 18). O cliente devolve pelo WhatsApp
// a proposta assinada no gov.br e o comprovante da entrada; o corretor
// confirma cada um. O sistema não processa pagamento: só guarda o arquivo e
// registra a decisão do corretor.

const VALIDADE_DA_URL_EM_SEGUNDOS = 300;
const INTERVALO_DOS_LEMBRETES_EM_DIAS = 2;

export const ASSINADOR_GOV_BR = "https://assinador.iti.br";

// O negócio não está na etapa em que a ação faz sentido.
export class ForaDaEtapaError extends Error {
  override name = "ForaDaEtapaError";
}

// Confirmar assinatura sem PDF assinado recebido, ou proposta não enviada.
export class SemPropostaAssinadaError extends Error {
  override name = "SemPropostaAssinadaError";
}

export class SemInstrucoesDePagamentoError extends Error {
  override name = "SemInstrucoesDePagamentoError";
}

const formatoData = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO,
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

// A proposta mais recente que não expirou (enviada ou assinada).
async function propostaDoFechamento(negocioId: string) {
  const [found] = await db
    .select({
      id: propostas.id,
      estado: propostas.estado,
      loteId: propostas.loteId,
      planoId: propostas.planoId,
      modeloDeCasaId: propostas.modeloDeCasaId,
      chavePdfAssinado: propostas.chavePdfAssinado,
    })
    .from(propostas)
    .where(
      and(eq(propostas.negocioId, negocioId), ne(propostas.estado, "expirada")),
    )
    .orderBy(desc(propostas.criadaEm))
    .limit(1);
  return found ?? null;
}

async function entradaNaEtapa(negocioId: string, etapa: Etapa) {
  const [entrada] = await db
    .select({ em: max(negocioEtapas.em) })
    .from(negocioEtapas)
    .where(
      and(
        eq(negocioEtapas.negocioId, negocioId),
        eq(negocioEtapas.para, etapa),
      ),
    );
  return entrada?.em ?? null;
}

async function resolverPendencias(
  negocioId: string,
  tipo: "confirmar_assinatura" | "confirmar_pagamento",
  agora: Date,
) {
  await db
    .update(pendencias)
    .set({ estado: "resolvida", resolvidaEm: agora })
    .where(
      and(
        eq(pendencias.negocioId, negocioId),
        eq(pendencias.tipo, tipo),
        eq(pendencias.estado, "aberta"),
      ),
    );
}

// ---- Arquivos recebidos --------------------------------------------------------

const arquivoColumns = {
  id: arquivosDoFechamento.id,
  tipo: arquivosDoFechamento.tipo,
  mimeType: arquivosDoFechamento.mimeType,
  aceito: arquivosDoFechamento.aceito,
  recebidoEm: arquivosDoFechamento.recebidoEm,
};

export type ArquivoDoFechamento = {
  id: string;
  tipo: TipoDeArquivoDoFechamento;
  mimeType: string;
  aceito: boolean | null;
  recebidoEm: Date;
};

async function lerArquivo(where: ReturnType<typeof eq>) {
  const [found] = await db
    .select(arquivoColumns)
    .from(arquivosDoFechamento)
    .where(where);
  return found ?? null;
}

const ehPdf = sql`(${mensagens.midia}->>'mimetype' = 'application/pdf' or lower(${mensagens.midia}->>'nomeDoArquivo') like '%.pdf')`;

// Como em `registrarDocumentoRecebido` (ticket 16): as mídias do cliente
// desde a entrada na etapa, da mais antiga para a mais nova; registra a
// primeira ainda sem arquivo. A mensagem de origem é a chave natural:
// repetir devolve o já registrado. Sem mídia → null.
async function registrarArquivoRecebido(
  negocio: NegocioDoCorretor,
  input: {
    etapa: Etapa;
    tipo: TipoDeArquivoDoFechamento;
    propostaId: string;
    soPdf: boolean;
  },
): Promise<{
  arquivo: ArquivoDoFechamento;
  chave: string;
  novo: boolean;
} | null> {
  const entrada = await entradaNaEtapa(negocio.id, input.etapa);
  const recebidas = await db
    .select({
      id: mensagens.id,
      evolutionId: mensagens.evolutionId,
      arquivoId: arquivosDoFechamento.id,
      chave: arquivosDoFechamento.chave,
    })
    .from(mensagens)
    .innerJoin(conversas, eq(conversas.id, mensagens.conversaId))
    .leftJoin(
      arquivosDoFechamento,
      eq(arquivosDoFechamento.mensagemId, mensagens.id),
    )
    .leftJoin(
      documentosDoCliente,
      eq(documentosDoCliente.mensagemId, mensagens.id),
    )
    .where(
      and(
        eq(conversas.clienteId, negocio.clienteId),
        eq(conversas.corretorId, negocio.corretorId),
        eq(mensagens.autor, "cliente"),
        input.soPdf
          ? and(sql`${mensagens.midia}->>'tipo' = 'documento'`, ehPdf)
          : inArray(sql`${mensagens.midia}->>'tipo'`, ["imagem", "documento"]),
        entrada ? gte(mensagens.enviadaEm, entrada) : undefined,
        // Mídia já registrada como documento da coleta ou como o outro
        // tipo não conta.
        isNull(documentosDoCliente.id),
        or(
          isNull(arquivosDoFechamento.id),
          eq(arquivosDoFechamento.tipo, input.tipo),
        ),
      ),
    )
    .orderBy(asc(mensagens.enviadaEm), asc(mensagens.criadaEm));
  const midia = recebidas.find((m) => !m.arquivoId);
  if (!midia) {
    const ultima = recebidas.at(-1);
    if (!ultima?.arquivoId || !ultima.chave) return null;
    const arquivo = await lerArquivo(
      eq(arquivosDoFechamento.id, ultima.arquivoId),
    );
    return arquivo ? { arquivo, chave: ultima.chave, novo: false } : null;
  }

  const [conexao] = await db
    .select({ instancia: whatsappConexoes.instancia })
    .from(whatsappConexoes)
    .where(eq(whatsappConexoes.corretorId, negocio.corretorId));
  if (!conexao?.instancia) return null;

  const baixado = await whatsapp.baixarMidia(
    conexao.instancia,
    midia.evolutionId ?? "",
  );
  const chave = `imobiliarias/${negocio.imobiliariaId}/negocios/${negocio.id}/fechamento/${crypto.randomUUID()}`;
  await storage.salvarArquivo(chave, baixado.bytes, baixado.mimeType);
  const [criado] = await db
    .insert(arquivosDoFechamento)
    .values({
      imobiliariaId: negocio.imobiliariaId,
      corretorId: negocio.corretorId,
      negocioId: negocio.id,
      propostaId: input.propostaId,
      tipo: input.tipo,
      chave,
      mimeType: baixado.mimeType,
      mensagemId: midia.id,
      recebidoEm: new Date(),
    })
    .onConflictDoNothing({ target: arquivosDoFechamento.mensagemId })
    .returning({ ...arquivoColumns, chave: arquivosDoFechamento.chave });
  if (!criado) {
    // Outro processo registrou a mesma mensagem antes: fica o dele.
    await storage.apagarArquivo(chave);
    const [existente] = await db
      .select({ ...arquivoColumns, chave: arquivosDoFechamento.chave })
      .from(arquivosDoFechamento)
      .where(eq(arquivosDoFechamento.mensagemId, midia.id));
    if (!existente) return null;
    const { chave: chaveExistente, ...arquivo } = existente;
    return { arquivo, chave: chaveExistente, novo: false };
  }
  const { chave: _, ...arquivo } = criado;
  return { arquivo, chave, novo: true };
}

// ---- Assinatura ------------------------------------------------------------------

// Ferramenta `registrar_proposta_assinada`: em Aguardando assinatura, guarda o
// PDF que o cliente mandou, anexa à proposta como PDF assinado e cria a
// pendência "confirmar assinatura". Outra etapa → ForaDaEtapaError; sem
// proposta enviada → SemPropostaAssinadaError; sem PDF recebido → null.
export async function registrarPropostaAssinada(
  session: Session,
  negocioId: string,
): Promise<ArquivoDoFechamento | null> {
  const negocio = await negocioDoCorretor(session, negocioId);
  if (!negocio) return null;
  if (negocio.etapa !== "aguardando_assinatura") {
    throw new ForaDaEtapaError("O negócio não está em Aguardando assinatura");
  }
  const proposta = await propostaDoFechamento(negocio.id);
  if (!proposta || proposta.estado !== "enviada") {
    throw new SemPropostaAssinadaError(
      "Não há proposta enviada aguardando assinatura",
    );
  }
  const registrado = await registrarArquivoRecebido(negocio, {
    etapa: "aguardando_assinatura",
    tipo: "proposta_assinada",
    propostaId: proposta.id,
    soPdf: true,
  });
  if (!registrado) return null;
  if (registrado.novo) {
    await db
      .update(propostas)
      .set({ chavePdfAssinado: registrado.chave })
      .where(
        and(eq(propostas.id, proposta.id), eq(propostas.estado, "enviada")),
      );
  }
  await criarPendencia(session, {
    negocioId: negocio.id,
    tipo: "confirmar_assinatura",
    descricao: `${negocio.clienteNome} devolveu a proposta assinada. Confira a assinatura do gov.br no PDF.`,
  });
  return registrado.arquivo;
}

export function textoDasInstrucoesDePagamento(
  entrada: number,
  instrucoes: string,
) {
  return [
    "Assinatura confirmada! Agora falta só a entrada.",
    `Valor da entrada: ${reais(entrada)}`,
    instrucoes,
    "Depois de pagar, mande o comprovante (foto ou PDF) aqui nesta conversa.",
  ].join("\n");
}

export const TEXTO_DE_REENVIO_DA_ASSINATURA = [
  "Não conseguimos confirmar a assinatura da proposta que você enviou.",
  `Pode assinar de novo pelo gov.br (${ASSINADOR_GOV_BR}) e mandar o PDF assinado aqui nesta conversa?`,
].join("\n");

// Corretor confirma a assinatura: proposta → assinada, negócio → Aguardando
// pagamento e o assistente envia as instruções de pagamento da incorporadora
// com o valor da entrada (de `calcularPlanoParaLote`). Envio recusado
// (opt-out, sem WhatsApp) desfaz tudo. Confirmar de novo não reenvia.
// Fora do escopo → null.
export async function confirmarAssinatura(session: Session, negocioId: string) {
  const negocio = await negocioDoCorretor(session, negocioId);
  if (!negocio) return null;
  const proposta = await propostaDoFechamento(negocio.id);
  if (proposta?.estado === "assinada") {
    // Já confirmada: só completa o que uma falha no meio possa ter deixado.
    if (negocio.etapa === "aguardando_assinatura") {
      await mudarEtapa(session, negocio.id, "aguardando_pagamento");
    }
    await resolverPendencias(negocio.id, "confirmar_assinatura", new Date());
    return { propostaId: proposta.id, estado: proposta.estado };
  }
  if (negocio.etapa !== "aguardando_assinatura") {
    throw new ForaDaEtapaError("O negócio não está em Aguardando assinatura");
  }
  if (
    !proposta ||
    proposta.estado !== "enviada" ||
    !proposta.chavePdfAssinado
  ) {
    throw new SemPropostaAssinadaError(
      "O cliente ainda não enviou a proposta assinada",
    );
  }
  const chavePdfAssinado = proposta.chavePdfAssinado;

  const [dados] = await db
    .select({ instrucoes: incorporadoras.instrucoesDePagamento })
    .from(lotes)
    .innerJoin(empreendimentos, eq(empreendimentos.id, lotes.empreendimentoId))
    .innerJoin(
      incorporadoras,
      eq(incorporadoras.id, empreendimentos.incorporadoraId),
    )
    .where(eq(lotes.id, proposta.loteId));
  const instrucoes = dados?.instrucoes?.trim();
  if (!instrucoes) {
    throw new SemInstrucoesDePagamentoError(
      "A incorporadora não tem instruções de pagamento",
    );
  }
  const calculo = await calcularPlanoParaLote(session, {
    loteId: proposta.loteId,
    planoId: proposta.planoId,
    modeloDeCasaId: proposta.modeloDeCasaId ?? undefined,
  });
  if (!calculo) throw new Error("assinatura: plano da proposta não calculável");
  const contexto = await contextoDoNegocio(negocio.id);
  if (!contexto) {
    throw new SemWhatsappError(
      "Sem conversa no WhatsApp com este cliente para enviar as instruções",
    );
  }
  const texto = textoDasInstrucoesDePagamento(calculo.entrada, instrucoes);

  const enviado = await db.transaction(async (tx) => {
    const [assinada] = await tx
      .update(propostas)
      .set({ estado: "assinada" })
      .where(
        and(
          eq(propostas.id, proposta.id),
          eq(propostas.estado, "enviada"),
          eq(propostas.chavePdfAssinado, chavePdfAssinado),
        ),
      )
      .returning({ id: propostas.id });
    if (!assinada) return null;
    await tx
      .update(arquivosDoFechamento)
      .set({ aceito: true })
      .where(eq(arquivosDoFechamento.chave, chavePdfAssinado));
    return enviarTextoAoCliente(contexto, texto);
  });
  if (enviado) {
    await mudarEtapa(session, negocio.id, "aguardando_pagamento");
    await resolverPendencias(negocio.id, "confirmar_assinatura", new Date());
  }
  const atual = await propostaDoFechamento(negocio.id);
  return atual ? { propostaId: atual.id, estado: atual.estado } : null;
}

// Corretor recusa a assinatura recebida: o PDF deixa de valer, a pendência é
// resolvida e o assistente pede ao cliente que assine e envie de novo.
// Sem PDF assinado à espera: nada muda. Fora do escopo → null.
export async function rejeitarAssinatura(session: Session, negocioId: string) {
  const negocio = await negocioDoCorretor(session, negocioId);
  if (!negocio) return null;
  const proposta = await propostaDoFechamento(negocio.id);
  const chave =
    proposta?.estado === "enviada" ? proposta.chavePdfAssinado : null;
  if (!proposta || !chave) {
    await resolverPendencias(negocio.id, "confirmar_assinatura", new Date());
    return { rejeitada: false };
  }
  const contexto = await contextoDoNegocio(negocio.id);
  if (!contexto) {
    throw new SemWhatsappError(
      "Sem conversa no WhatsApp com este cliente para pedir o reenvio",
    );
  }
  const enviado = await db.transaction(async (tx) => {
    const [liberada] = await tx
      .update(propostas)
      .set({ chavePdfAssinado: null })
      .where(
        and(
          eq(propostas.id, proposta.id),
          eq(propostas.estado, "enviada"),
          eq(propostas.chavePdfAssinado, chave),
        ),
      )
      .returning({ id: propostas.id });
    if (!liberada) return null;
    await tx
      .update(arquivosDoFechamento)
      .set({ aceito: false })
      .where(eq(arquivosDoFechamento.chave, chave));
    return enviarTextoAoCliente(contexto, TEXTO_DE_REENVIO_DA_ASSINATURA);
  });
  await resolverPendencias(negocio.id, "confirmar_assinatura", new Date());
  return { rejeitada: enviado !== null };
}

// ---- Pagamento --------------------------------------------------------------------

// Ferramenta `registrar_comprovante_de_pagamento`: em Aguardando pagamento,
// guarda a foto ou o PDF do comprovante e cria a pendência "confirmar
// pagamento". Outra etapa → ForaDaEtapaError; sem mídia → null.
export async function registrarComprovanteDePagamento(
  session: Session,
  negocioId: string,
): Promise<ArquivoDoFechamento | null> {
  const negocio = await negocioDoCorretor(session, negocioId);
  if (!negocio) return null;
  if (negocio.etapa !== "aguardando_pagamento") {
    throw new ForaDaEtapaError("O negócio não está em Aguardando pagamento");
  }
  const proposta = await propostaDoFechamento(negocio.id);
  if (!proposta || proposta.estado !== "assinada") {
    throw new SemPropostaAssinadaError("A proposta ainda não foi assinada");
  }
  const registrado = await registrarArquivoRecebido(negocio, {
    etapa: "aguardando_pagamento",
    tipo: "comprovante_de_pagamento",
    propostaId: proposta.id,
    soPdf: false,
  });
  if (!registrado) return null;
  await criarPendencia(session, {
    negocioId: negocio.id,
    tipo: "confirmar_pagamento",
    descricao: `${negocio.clienteNome} enviou o comprovante de pagamento da entrada. Confira o valor e o recebimento.`,
  });
  return registrado.arquivo;
}

// Corretor confirma o pagamento: negócio → Ganho, lote → vendido, reserva
// concluída (o job de expiração passa a ignorá-la), comprovantes aceitos e
// pendência resolvida, tudo numa transação. Já em Ganho: nada muda. Lote
// vendido ou reservado para outra proposta → LoteIndisponivelError. Fora do
// escopo → null.
export async function confirmarPagamento(session: Session, negocioId: string) {
  const negocio = await negocioDoCorretor(session, negocioId);
  if (!negocio) return null;
  if (negocio.etapa === "ganho") return { etapa: negocio.etapa };
  if (negocio.etapa !== "aguardando_pagamento") {
    throw new ForaDaEtapaError("O negócio não está em Aguardando pagamento");
  }
  const proposta = await propostaDoFechamento(negocio.id);
  if (!proposta || proposta.estado !== "assinada") {
    throw new SemPropostaAssinadaError("A proposta ainda não foi assinada");
  }

  const agora = new Date();
  return db.transaction(async (tx) => {
    const [atual] = await tx
      .select({ etapa: negocios.etapa })
      .from(negocios)
      .where(eq(negocios.id, negocio.id))
      .for("update");
    if (!atual || atual.etapa !== "aguardando_pagamento") {
      return { etapa: atual?.etapa ?? negocio.etapa };
    }
    const [lote] = await tx
      .select({
        quadra: lotes.quadra,
        numero: lotes.numero,
        status: lotes.status,
      })
      .from(lotes)
      .where(eq(lotes.id, proposta.loteId))
      .for("update");
    if (!lote) throw new LoteIndisponivelError("Lote não encontrado");
    const [outraReserva] = await tx
      .select({ id: reservas.id })
      .from(reservas)
      .where(
        and(
          eq(reservas.loteId, proposta.loteId),
          eq(reservas.estado, "ativa"),
          ne(reservas.propostaId, proposta.id),
        ),
      );
    if (lote.status === "vendido" || outraReserva) {
      throw new LoteIndisponivelError(
        `O lote ${lote.quadra}-${lote.numero} já está ${lote.status}`,
      );
    }
    await tx
      .update(lotes)
      .set({ status: "vendido" })
      .where(eq(lotes.id, proposta.loteId));
    await tx
      .update(reservas)
      .set({ estado: "concluida" })
      .where(
        and(eq(reservas.propostaId, proposta.id), eq(reservas.estado, "ativa")),
      );
    await tx
      .update(negocios)
      .set({ etapa: "ganho", motivoPerda: null, atualizadoEm: agora })
      .where(eq(negocios.id, negocio.id));
    await tx.insert(negocioEtapas).values({
      negocioId: negocio.id,
      de: "aguardando_pagamento",
      para: "ganho",
      autor: "corretor",
      em: agora,
    });
    await tx
      .update(arquivosDoFechamento)
      .set({ aceito: true })
      .where(
        and(
          eq(arquivosDoFechamento.negocioId, negocio.id),
          eq(arquivosDoFechamento.tipo, "comprovante_de_pagamento"),
          isNull(arquivosDoFechamento.aceito),
        ),
      );
    await tx
      .update(pendencias)
      .set({ estado: "resolvida", resolvidaEm: agora })
      .where(
        and(
          eq(pendencias.negocioId, negocio.id),
          eq(pendencias.tipo, "confirmar_pagamento"),
          eq(pendencias.estado, "aberta"),
        ),
      );
    return { etapa: "ganho" as const };
  });
}

// ---- Leitura para o corretor --------------------------------------------------------

// PDF assinado e comprovantes do negócio, com URLs assinadas de curta
// duração (as chaves não saem daqui). Fora do escopo → null.
export async function buscarFechamento(session: Session, negocioId: string) {
  const negocio = await negocioDoCorretor(session, negocioId);
  if (!negocio) return null;
  const proposta = await propostaDoFechamento(negocio.id);
  const lista = await db
    .select({ ...arquivoColumns, chave: arquivosDoFechamento.chave })
    .from(arquivosDoFechamento)
    .where(eq(arquivosDoFechamento.negocioId, negocio.id))
    .orderBy(desc(arquivosDoFechamento.recebidoEm));
  const comUrl = ({ chave, ...arquivo }: (typeof lista)[number]) => ({
    ...arquivo,
    url: storage.urlAssinada(chave, VALIDADE_DA_URL_EM_SEGUNDOS),
  });
  const assinado = proposta?.chavePdfAssinado
    ? lista.find((a) => a.chave === proposta.chavePdfAssinado)
    : undefined;
  return {
    etapa: negocio.etapa,
    propostaEstado: proposta?.estado ?? null,
    propostaAssinada: assinado ? comUrl(assinado) : null,
    comprovantes: lista
      .filter((a) => a.tipo === "comprovante_de_pagamento")
      .map(comUrl),
  };
}

export type Fechamento = NonNullable<
  Awaited<ReturnType<typeof buscarFechamento>>
>;

// ---- Lembretes (worker) ---------------------------------------------------------------

export function textoDoLembreteDeAssinatura(expiraEm: Date | null) {
  return [
    "Oi! Passando para lembrar da sua proposta.",
    `Para assinar pelo gov.br, acesse ${ASSINADOR_GOV_BR}, envie o PDF, assine e mande o PDF assinado aqui.`,
    expiraEm
      ? `O lote está reservado para você até ${formatoData.format(expiraEm)}.`
      : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export function textoDoLembreteDePagamento(
  entrada: number | null,
  expiraEm: Date | null,
) {
  return [
    entrada === null
      ? "Oi! Passando para lembrar do pagamento da entrada."
      : `Oi! Passando para lembrar do pagamento da entrada de ${reais(entrada)}, conforme as instruções que enviei.`,
    "Depois de pagar, é só mandar o comprovante (foto ou PDF) aqui.",
    expiraEm
      ? `O lote está reservado para você até ${formatoData.format(expiraEm)}.`
      : null,
  ]
    .filter(Boolean)
    .join("\n");
}

const etapasComLembrete = [
  "aguardando_assinatura",
  "aguardando_pagamento",
] as const;

// Spec → Follow-up: em Aguardando assinatura e Aguardando pagamento, um
// lembrete prático a cada 2 dias (contados da entrada na etapa e depois do
// último lembrete), só 8h–20h de segunda a sábado, até a expiração da
// reserva quando houver. Não lembra quem já mandou o PDF ou o comprovante
// (aguarda o corretor). Chave natural negócio + data; falha no envio desfaz
// a marcação. Conversa pausada, desligada ou com opt-out não recebe.
export async function enviarLembretesDeEtapasFinais(): Promise<{
  enviados: number;
}> {
  const agora = new Date();
  if (!naJanelaDeEnvio(agora)) return { enviados: 0 };
  const hoje = partesEmBrasilia(agora).data;

  const candidatos = await db
    .select({
      id: negocios.id,
      imobiliariaId: negocios.imobiliariaId,
      corretorId: negocios.corretorId,
      clienteId: negocios.clienteId,
      etapa: negocios.etapa,
      interesse: negocios.interesse,
      empreendimentoInteresseId: negocios.empreendimentoInteresseId,
      loteInteresseId: negocios.loteInteresseId,
    })
    .from(negocios)
    .innerJoin(clientes, eq(clientes.id, negocios.clienteId))
    .innerJoin(
      conversas,
      and(
        eq(conversas.clienteId, negocios.clienteId),
        eq(conversas.corretorId, negocios.corretorId),
      ),
    )
    .where(
      and(
        inArray(negocios.etapa, [...etapasComLembrete]),
        eq(conversas.assistente, "ativo"),
        eq(conversas.optOut, false),
        isNull(clientes.anonimizadoEm),
      ),
    );

  let enviados = 0;
  for (const negocio of candidatos) {
    const entrada = await entradaNaEtapa(negocio.id, negocio.etapa);
    if (!entrada) continue;
    const diaDaEntrada = partesEmBrasilia(entrada).data;
    const [ultimo] = await db
      .select({ data: max(lembretesDeEtapasFinais.data) })
      .from(lembretesDeEtapasFinais)
      .where(
        and(
          eq(lembretesDeEtapasFinais.negocioId, negocio.id),
          eq(lembretesDeEtapasFinais.etapa, negocio.etapa),
          gte(lembretesDeEtapasFinais.data, diaDaEntrada),
        ),
      );
    const base = ultimo?.data ?? diaDaEntrada;
    if (hoje < somarDias(base, INTERVALO_DOS_LEMBRETES_EM_DIAS)) continue;

    const [proposta] = await db
      .select({
        id: propostas.id,
        estado: propostas.estado,
        loteId: propostas.loteId,
        planoId: propostas.planoId,
        modeloDeCasaId: propostas.modeloDeCasaId,
        chavePdfAssinado: propostas.chavePdfAssinado,
        reserva: { estado: reservas.estado, expiraEm: reservas.expiraEm },
      })
      .from(propostas)
      .leftJoin(reservas, eq(reservas.propostaId, propostas.id))
      .where(eq(propostas.negocioId, negocio.id))
      .orderBy(desc(propostas.criadaEm))
      .limit(1);
    const reserva = proposta?.reserva?.estado ? proposta.reserva : null;
    if (
      reserva &&
      (reserva.estado !== "ativa" ||
        reserva.expiraEm.getTime() <= agora.getTime())
    ) {
      continue;
    }

    let texto: string;
    if (negocio.etapa === "aguardando_assinatura") {
      if (
        !proposta ||
        proposta.estado !== "enviada" ||
        proposta.chavePdfAssinado
      ) {
        continue;
      }
      texto = textoDoLembreteDeAssinatura(reserva?.expiraEm ?? null);
    } else {
      const [aguardando] = await db
        .select({ id: arquivosDoFechamento.id })
        .from(arquivosDoFechamento)
        .where(
          and(
            eq(arquivosDoFechamento.negocioId, negocio.id),
            eq(arquivosDoFechamento.tipo, "comprovante_de_pagamento"),
            isNull(arquivosDoFechamento.aceito),
          ),
        )
        .limit(1);
      if (aguardando) continue;
      const calculo = proposta
        ? await calcularPlanoParaLote(
            {
              role: "corretor",
              corretorId: negocio.corretorId,
              imobiliariaId: negocio.imobiliariaId,
            },
            {
              loteId: proposta.loteId,
              planoId: proposta.planoId,
              modeloDeCasaId: proposta.modeloDeCasaId ?? undefined,
            },
          )
        : null;
      texto = textoDoLembreteDePagamento(
        calculo?.entrada ?? null,
        reserva?.expiraEm ?? null,
      );
    }

    const contexto = await contextoDoNegocio(negocio.id);
    if (!contexto) continue;
    try {
      const enviado = await db.transaction(async (tx) => {
        const [marcado] = await tx
          .insert(lembretesDeEtapasFinais)
          .values({
            negocioId: negocio.id,
            etapa: negocio.etapa,
            data: hoje,
            enviadoEm: agora,
          })
          .onConflictDoNothing()
          .returning({ id: lembretesDeEtapasFinais.id });
        if (!marcado) return null;
        return enviarTextoAoCliente(contexto, texto);
      });
      if (!enviado) continue;
      enviados++;
    } catch (error) {
      console.error("fechamento: falha ao enviar o lembrete", error);
    }
  }
  return { enviados };
}

// Para src/worker/jobs.ts.
export const jobDeLembretesDeEtapasFinais = {
  nome: "lembretes-de-etapas-finais",
  executar: enviarLembretesDeEtapasFinais,
};
