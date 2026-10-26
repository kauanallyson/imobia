import "server-only";
import { and, desc, eq, lte, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  type AutorDeEtapa,
  clientes,
  conversas,
  type EstadoDaProposta,
  type EstadoDaReserva,
  empreendimentos,
  lotes,
  modelosDeCasa,
  modelosDeProposta,
  negocios,
  pendencias,
  planosDePagamento,
  propostas,
  reservas,
  users,
  whatsappConexoes,
} from "@/lib/db/schema";
import * as documentos from "@/lib/documentos";
import { FUSO, partesEmBrasilia } from "@/lib/fuso";
import * as storage from "@/lib/storage";
import {
  type ContextoDoAtendimento,
  enviarMidiaAoCliente,
  enviarTextoAoCliente,
  gravarMensagemDoAssistente,
} from "./assistente/contexto";
import {
  type ItemDaColeta,
  LoteIndisponivelError,
  rotuloDoItem,
  statusDaColeta,
} from "./coleta-de-dados";
import { isUniqueViolation } from "./errors";
import { buscarIncorporadora } from "./incorporadoras";
import { mudarEtapa } from "./negocios";
import { criarPendencia } from "./pendencias";
import { calcularPlanoParaLote } from "./planos-de-pagamento";
import { requireCorretor, type Session } from "./session";

// Proposta e reserva (ticket 17; GLOSSARY → Proposta, Reserva). O modelo DOCX
// é da incorporadora (catálogo da imobiliária); propostas e reservas são do
// corretor dono do negócio. Valores vêm só de `calcularPlanoParaLote`.

export const RESERVA_EM_HORAS = 72;
const VALIDADE_DA_URL_EM_SEGUNDOS = 300;
// A Evolution baixa o PDF logo após o envio; folga para filas e reenvios.
const VALIDADE_DA_URL_DE_ENVIO_EM_SEGUNDOS = 3600;
const HORA_MS = 60 * 60 * 1000;

export const CONTENT_TYPE_DOCX =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// Placeholders aceitos no modelo (escreva `{nome}` no DOCX). Documentados na
// página da incorporadora.
export const camposDaProposta = {
  cliente_nome: "Nome do cliente",
  cliente_cpf: "CPF do cliente (000.000.000-00)",
  cliente_email: "E-mail do cliente",
  cliente_telefone: "Telefone do cliente",
  empreendimento: "Nome do empreendimento",
  cidade: "Cidade do empreendimento",
  lote_quadra: "Quadra do lote",
  lote_numero: "Número do lote",
  lote_area: "Área do lote em m²",
  modelo_de_casa: 'Modelo de casa ("Somente o lote" sem casa)',
  plano: "Nome do plano de pagamento",
  preco_total: "Preço total (lote + casa)",
  entrada: "Valor da entrada",
  parcela: "Valor da parcela",
  parcelas: "Número de parcelas",
  forma_pagamento: "Forma de pagamento (Cartão ou Pix)",
  dia_pagamento: "Dia do mês para pagamento",
  primeira_parcela: "Data da primeira parcela (dd/mm/aaaa)",
  data: "Data de emissão da proposta (dd/mm/aaaa)",
} as const;
export type CampoDaProposta = keyof typeof camposDaProposta;

export class ModeloDePropostaInvalidoError extends Error {
  override name = "ModeloDePropostaInvalidoError";
}

export class SemModeloDePropostaError extends Error {
  override name = "SemModeloDePropostaError";
}

export type ItemFaltandoNaProposta = ItemDaColeta | "plano";

export class ColetaIncompletaError extends Error {
  override name = "ColetaIncompletaError";
  constructor(readonly faltando: ItemFaltandoNaProposta[]) {
    super(
      `Falta para a proposta: ${faltando
        .map((i) => (i === "plano" ? "plano de pagamento" : rotuloDoItem[i]))
        .join("; ")}`,
    );
  }
}

// Sem conversa no WhatsApp (cliente cadastrado à mão) ou WhatsApp do
// corretor desconectado: não há por onde enviar a proposta.
export class SemWhatsappError extends Error {
  override name = "SemWhatsappError";
}

export class PrazoDaReservaInvalidoError extends Error {
  override name = "PrazoDaReservaInvalidoError";
}

// ---- Formatação dos campos -------------------------------------------------

const formatoReais = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
export const reais = (valor: number) =>
  formatoReais.format(valor).replace(/ /g, " ");
const dataBr = (iso: string) => iso.split("-").reverse().join("/");
const cpfFormatado = (cpf: string) =>
  cpf.length === 11
    ? `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`
    : cpf;
const formatoExpiracao = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

// ---- Modelo da incorporadora ----------------------------------------------

const modeloColumns = {
  incorporadoraId: modelosDeProposta.incorporadoraId,
  chave: modelosDeProposta.chave,
  nomeDoArquivo: modelosDeProposta.nomeDoArquivo,
  campos: modelosDeProposta.campos,
  enviadoEm: modelosDeProposta.enviadoEm,
};

function comDesconhecidos<T extends { campos: string[] }>(modelo: T) {
  return {
    ...modelo,
    desconhecidos: modelo.campos.filter((c) => !(c in camposDaProposta)),
  };
}

// Envia (ou substitui) o modelo DOCX da incorporadora. Arquivo que não é DOCX
// → ModeloDePropostaInvalidoError. Incorporadora fora do escopo → null.
export async function enviarModeloDeProposta(
  session: Session,
  input: {
    incorporadoraId: string;
    nomeDoArquivo: string;
    conteudo: Uint8Array;
  },
) {
  const { imobiliariaId } = requireCorretor(session);
  const incorporadora = await buscarIncorporadora(
    session,
    input.incorporadoraId,
  );
  if (!incorporadora) return null;
  let campos: string[];
  try {
    campos = documentos.lerCampos(input.conteudo);
  } catch (error) {
    if (error instanceof documentos.ModeloInvalidoError) {
      throw new ModeloDePropostaInvalidoError(error.message);
    }
    throw error;
  }

  const [anterior] = await db
    .select({ chave: modelosDeProposta.chave })
    .from(modelosDeProposta)
    .where(eq(modelosDeProposta.incorporadoraId, incorporadora.id));
  const chave = `imobiliarias/${imobiliariaId}/incorporadoras/${incorporadora.id}/modelo-de-proposta/${crypto.randomUUID()}.docx`;
  await storage.salvarArquivo(chave, input.conteudo, CONTENT_TYPE_DOCX);
  const valores = {
    chave,
    nomeDoArquivo: input.nomeDoArquivo,
    campos,
    enviadoEm: new Date(),
  };
  const [salvo] = await db
    .insert(modelosDeProposta)
    .values({ incorporadoraId: incorporadora.id, imobiliariaId, ...valores })
    .onConflictDoUpdate({
      target: modelosDeProposta.incorporadoraId,
      set: valores,
    })
    .returning(modeloColumns);
  if (anterior && anterior.chave !== chave) {
    await storage.apagarArquivo(anterior.chave);
  }
  if (!salvo) return null;
  const { chave: _, ...dto } = salvo;
  return comDesconhecidos(dto);
}

// Modelo atual com URL assinada de curta duração (a chave não sai daqui).
export async function buscarModeloDeProposta(
  session: Session,
  incorporadoraId: string,
) {
  const { imobiliariaId } = requireCorretor(session);
  if (!z.uuid().safeParse(incorporadoraId).success) return null;
  const [found] = await db
    .select(modeloColumns)
    .from(modelosDeProposta)
    .where(
      and(
        eq(modelosDeProposta.incorporadoraId, incorporadoraId),
        eq(modelosDeProposta.imobiliariaId, imobiliariaId),
      ),
    );
  if (!found) return null;
  const { chave, ...dto } = found;
  return comDesconhecidos({
    ...dto,
    url: storage.urlAssinada(chave, VALIDADE_DA_URL_EM_SEGUNDOS),
  });
}

// ---- Proposta ---------------------------------------------------------------

const propostaColumns = {
  id: propostas.id,
  negocioId: propostas.negocioId,
  loteId: propostas.loteId,
  modeloDeCasaId: propostas.modeloDeCasaId,
  planoId: propostas.planoId,
  diaDePagamento: propostas.diaDePagamento,
  primeiraParcela: propostas.primeiraParcela,
  estado: propostas.estado,
  criadaEm: propostas.criadaEm,
  enviadaEm: propostas.enviadaEm,
};

export type Proposta = {
  id: string;
  negocioId: string;
  loteId: string;
  modeloDeCasaId: string | null;
  planoId: string;
  diaDePagamento: number;
  primeiraParcela: string;
  estado: EstadoDaProposta;
  criadaEm: Date;
  enviadaEm: Date | null;
};

async function negocioDoCorretor(session: Session, negocioId: string) {
  const { corretorId } = requireCorretor(session);
  if (!z.uuid().safeParse(negocioId).success) return null;
  const [negocio] = await db
    .select({
      id: negocios.id,
      imobiliariaId: negocios.imobiliariaId,
      corretorId: negocios.corretorId,
      clienteId: negocios.clienteId,
      loteInteresseId: negocios.loteInteresseId,
      planoEscolhidoId: negocios.planoEscolhidoId,
      modeloDeCasaEscolhidoId: negocios.modeloDeCasaEscolhidoId,
    })
    .from(negocios)
    .where(
      and(eq(negocios.id, negocioId), eq(negocios.corretorId, corretorId)),
    );
  return negocio ?? null;
}

// A proposta viva (não expirada) do negócio, se houver.
async function propostaViva(negocioId: string): Promise<Proposta | null> {
  const [found] = await db
    .select(propostaColumns)
    .from(propostas)
    .where(
      and(eq(propostas.negocioId, negocioId), ne(propostas.estado, "expirada")),
    );
  return found ?? null;
}

// Gera a proposta do negócio com a coleta completa: preenche o modelo da
// incorporadora, guarda o PDF privado, leva o negócio a Proposta em revisão e
// cria a pendência urgente "revisar proposta". Uma proposta viva por negócio
// (unique parcial): repetir, inclusive em paralelo, devolve a mesma. Lote
// reservado ou vendido → LoteIndisponivelError; falta dado →
// ColetaIncompletaError; incorporadora sem modelo → SemModeloDePropostaError.
// Negócio fora do escopo → null.
export async function gerarProposta(
  session: Session,
  negocioId: string,
  opcoes: { id?: string; autor?: AutorDeEtapa } = {},
): Promise<Proposta | null> {
  const negocio = await negocioDoCorretor(session, negocioId);
  if (!negocio) return null;
  const existente = await propostaViva(negocio.id);
  if (existente) return existente;

  const status = await statusDaColeta(session, negocio.id);
  if (!status) return null;
  const faltando: ItemFaltandoNaProposta[] = [...status.faltando];
  if (!negocio.planoEscolhidoId) faltando.push("plano");
  const { loteInteresseId, planoEscolhidoId } = negocio;
  if (faltando.length > 0 || !loteInteresseId || !planoEscolhidoId) {
    throw new ColetaIncompletaError(faltando);
  }

  const [dados] = await db
    .select({
      lote: {
        id: lotes.id,
        quadra: lotes.quadra,
        numero: lotes.numero,
        area: lotes.area,
        status: lotes.status,
      },
      empreendimento: empreendimentos.nome,
      cidade: empreendimentos.cidade,
      incorporadoraId: empreendimentos.incorporadoraId,
    })
    .from(lotes)
    .innerJoin(empreendimentos, eq(empreendimentos.id, lotes.empreendimentoId))
    .where(
      and(
        eq(lotes.id, loteInteresseId),
        eq(empreendimentos.imobiliariaId, negocio.imobiliariaId),
      ),
    );
  if (!dados) return null;
  if (dados.lote.status !== "disponivel") {
    throw new LoteIndisponivelError(
      `O lote ${dados.lote.quadra}-${dados.lote.numero} está ${dados.lote.status}`,
    );
  }
  const calculo = await calcularPlanoParaLote(session, {
    loteId: dados.lote.id,
    planoId: planoEscolhidoId,
    modeloDeCasaId: negocio.modeloDeCasaEscolhidoId ?? undefined,
  });
  if (!calculo) throw new ColetaIncompletaError(["plano"]);

  const [modelo] = await db
    .select({ chave: modelosDeProposta.chave })
    .from(modelosDeProposta)
    .where(eq(modelosDeProposta.incorporadoraId, dados.incorporadoraId));
  if (!modelo) {
    throw new SemModeloDePropostaError(
      "A incorporadora ainda não tem modelo de proposta",
    );
  }

  const [extra] = await db
    .select({
      cliente: {
        nome: clientes.nome,
        cpf: clientes.cpf,
        email: clientes.email,
        telefone: clientes.telefone,
        formaDePagamento: clientes.formaDePagamento,
        diaDePagamento: clientes.diaDePagamento,
        primeiraParcela: clientes.primeiraParcela,
      },
      plano: planosDePagamento.nome,
    })
    .from(clientes)
    .innerJoin(planosDePagamento, eq(planosDePagamento.id, planoEscolhidoId))
    .where(eq(clientes.id, negocio.clienteId));
  if (!extra) return null;
  const { cliente } = extra;
  const { diaDePagamento, primeiraParcela } = cliente;
  if (!diaDePagamento || !primeiraParcela) {
    throw new ColetaIncompletaError(["dia_de_pagamento"]);
  }
  const [casa] = negocio.modeloDeCasaEscolhidoId
    ? await db
        .select({ nome: modelosDeCasa.nome })
        .from(modelosDeCasa)
        .where(eq(modelosDeCasa.id, negocio.modeloDeCasaEscolhidoId))
    : [];

  const campos: Record<CampoDaProposta, string> = {
    cliente_nome: cliente.nome,
    cliente_cpf: cpfFormatado(cliente.cpf ?? ""),
    cliente_email: cliente.email ?? "",
    cliente_telefone: cliente.telefone,
    empreendimento: dados.empreendimento,
    cidade: dados.cidade,
    lote_quadra: dados.lote.quadra,
    lote_numero: dados.lote.numero,
    lote_area: `${dados.lote.area.toLocaleString("pt-BR")} m²`,
    modelo_de_casa: casa?.nome ?? "Somente o lote",
    plano: extra.plano,
    preco_total: reais(calculo.precoTotal),
    entrada: reais(calculo.entrada),
    parcela: reais(calculo.parcela),
    parcelas: String(calculo.parcelas),
    forma_pagamento: cliente.formaDePagamento === "cartao" ? "Cartão" : "Pix",
    dia_pagamento: String(diaDePagamento),
    primeira_parcela: dataBr(primeiraParcela),
    data: dataBr(partesEmBrasilia(new Date()).data),
  };

  const id = opcoes.id ?? crypto.randomUUID();
  const chavePdf = `imobiliarias/${negocio.imobiliariaId}/negocios/${negocio.id}/propostas/${id}.pdf`;
  // O insert segura a unique parcial até o commit: uma geração simultânea
  // espera e, no conflito, não faz nada (e relê a nossa).
  const criada = await db.transaction(async (tx) => {
    const [linha] = await tx
      .insert(propostas)
      .values({
        id,
        imobiliariaId: negocio.imobiliariaId,
        corretorId: negocio.corretorId,
        negocioId: negocio.id,
        loteId: dados.lote.id,
        modeloDeCasaId: negocio.modeloDeCasaEscolhidoId,
        planoId: planoEscolhidoId,
        diaDePagamento,
        primeiraParcela,
        chavePdf,
        criadaEm: new Date(),
      })
      .onConflictDoNothing()
      .returning(propostaColumns);
    if (!linha) return null;
    const docx = await storage.lerArquivo(modelo.chave);
    const pdf = await documentos.gerarPdf(docx, campos);
    await storage.salvarArquivo(chavePdf, pdf, "application/pdf");
    return linha;
  });
  if (!criada) return propostaViva(negocio.id);

  await mudarEtapa(session, negocio.id, "proposta_em_revisao", {
    autor: opcoes.autor ?? "corretor",
  });
  await criarPendencia(session, {
    negocioId: negocio.id,
    tipo: "revisar_proposta",
    descricao: `Proposta de ${cliente.nome}: ${dados.empreendimento}, quadra ${dados.lote.quadra}, lote ${dados.lote.numero}, plano ${extra.plano}.`,
  });
  return criada;
}

// A proposta mais recente do negócio, com o lote, o plano, o PDF (URL
// assinada) e a reserva. Sem proposta ou fora do escopo → null.
export async function buscarPropostaDoNegocio(
  session: Session,
  negocioId: string,
) {
  const { corretorId } = requireCorretor(session);
  if (!z.uuid().safeParse(negocioId).success) return null;
  const [found] = await db
    .select({
      ...propostaColumns,
      chavePdf: propostas.chavePdf,
      lote: { quadra: lotes.quadra, numero: lotes.numero },
      plano: planosDePagamento.nome,
      reserva: {
        id: reservas.id,
        estado: reservas.estado,
        expiraEm: reservas.expiraEm,
      },
    })
    .from(propostas)
    .innerJoin(lotes, eq(lotes.id, propostas.loteId))
    .innerJoin(planosDePagamento, eq(planosDePagamento.id, propostas.planoId))
    .leftJoin(reservas, eq(reservas.propostaId, propostas.id))
    .where(
      and(
        eq(propostas.negocioId, negocioId),
        eq(propostas.corretorId, corretorId),
      ),
    )
    .orderBy(desc(propostas.criadaEm))
    .limit(1);
  if (!found) return null;
  const { chavePdf, reserva, ...dto } = found;
  return {
    ...dto,
    reserva: reserva as {
      id: string;
      estado: EstadoDaReserva;
      expiraEm: Date;
    } | null,
    urlPdf: storage.urlAssinada(chavePdf, VALIDADE_DA_URL_EM_SEGUNDOS),
  };
}

export type PropostaDoNegocio = NonNullable<
  Awaited<ReturnType<typeof buscarPropostaDoNegocio>>
>;

export function instrucoesDeAssinatura(expiraEm: Date) {
  return [
    "Segue a sua proposta em PDF. Para assinar pelo gov.br, sem sair de casa:",
    "1. Acesse https://assinador.iti.br e entre com a sua conta gov.br (nível prata ou ouro).",
    "2. Envie o PDF da proposta, posicione a assinatura e confirme.",
    "3. Baixe o PDF assinado e mande aqui nesta conversa.",
    `O lote fica reservado para você até ${formatoExpiracao.format(expiraEm)}.`,
  ].join("\n");
}

// Aprovação do corretor: reserva o lote por 72h, envia o PDF ao cliente com
// as instruções do gov.br e leva o negócio a Aguardando assinatura. Tudo numa
// transação com o lote trancado: duas aprovações do mesmo lote em paralelo
// têm um só vencedor (a outra recebe LoteIndisponivelError); a unique parcial
// de reservas ativas é a garantia final do banco. Falha no envio (inclusive
// opt-out do cliente) desfaz a reserva. Aprovar de novo não reenvia.
// Fora do escopo → null.
export async function aprovarProposta(
  session: Session,
  propostaId: string,
): Promise<Proposta | null> {
  const { corretorId, imobiliariaId } = requireCorretor(session);
  if (!z.uuid().safeParse(propostaId).success) return null;
  const [alvo] = await db
    .select({
      ...propostaColumns,
      chavePdf: propostas.chavePdf,
      etapa: negocios.etapa,
      interesse: negocios.interesse,
      empreendimentoInteresseId: negocios.empreendimentoInteresseId,
      loteInteresseId: negocios.loteInteresseId,
      clienteId: negocios.clienteId,
    })
    .from(propostas)
    .innerJoin(negocios, eq(negocios.id, propostas.negocioId))
    .where(
      and(eq(propostas.id, propostaId), eq(propostas.corretorId, corretorId)),
    );
  if (!alvo) return null;
  const {
    chavePdf,
    etapa,
    interesse,
    empreendimentoInteresseId,
    loteInteresseId,
    clienteId,
    ...proposta
  } = alvo;
  if (proposta.estado !== "em_revisao") return proposta;

  const [canal] = await db
    .select({
      conversaId: conversas.id,
      telefone: clientes.telefone,
      instancia: whatsappConexoes.instancia,
      corretorNome: users.name,
    })
    .from(clientes)
    .innerJoin(
      conversas,
      and(
        eq(conversas.clienteId, clientes.id),
        eq(conversas.corretorId, corretorId),
      ),
    )
    .innerJoin(whatsappConexoes, eq(whatsappConexoes.corretorId, corretorId))
    .innerJoin(users, eq(users.id, corretorId))
    .where(eq(clientes.id, clienteId));
  if (!canal?.instancia) {
    throw new SemWhatsappError(
      "Sem conversa no WhatsApp com este cliente para enviar a proposta",
    );
  }
  const contexto: ContextoDoAtendimento = {
    session: { role: "corretor", corretorId, imobiliariaId },
    instancia: canal.instancia,
    corretor: { nome: canal.corretorNome },
    conversa: { id: canal.conversaId, telefone: canal.telefone },
    negocio: {
      id: proposta.negocioId,
      etapa,
      interesse,
      empreendimentoInteresseId,
      loteInteresseId,
    },
  };

  const agora = new Date();
  const expiraEm = new Date(agora.getTime() + RESERVA_EM_HORAS * HORA_MS);
  const instrucoes = instrucoesDeAssinatura(expiraEm);
  let enviados: { pdf: string; texto: string } | null;
  try {
    enviados = await db.transaction(async (tx) => {
      const [aindaEmRevisao] = await tx
        .select({ id: propostas.id })
        .from(propostas)
        .where(
          and(
            eq(propostas.id, proposta.id),
            eq(propostas.estado, "em_revisao"),
          ),
        )
        .for("update");
      if (!aindaEmRevisao) return null;
      const [lote] = await tx
        .select({
          quadra: lotes.quadra,
          numero: lotes.numero,
          status: lotes.status,
        })
        .from(lotes)
        .where(eq(lotes.id, proposta.loteId))
        .for("update");
      if (!lote || lote.status !== "disponivel") {
        throw new LoteIndisponivelError(
          lote
            ? `O lote ${lote.quadra}-${lote.numero} já está ${lote.status}`
            : "Lote não encontrado",
        );
      }
      await tx.insert(reservas).values({
        imobiliariaId,
        loteId: proposta.loteId,
        propostaId: proposta.id,
        expiraEm,
        criadaEm: agora,
      });
      await tx
        .update(lotes)
        .set({ status: "reservado" })
        .where(eq(lotes.id, proposta.loteId));
      await tx
        .update(propostas)
        .set({ estado: "enviada", enviadaEm: agora })
        .where(eq(propostas.id, proposta.id));
      const pdf = await enviarMidiaAoCliente(contexto, {
        tipo: "document",
        url: storage.urlAssinada(
          chavePdf,
          VALIDADE_DA_URL_DE_ENVIO_EM_SEGUNDOS,
        ),
        mimetype: "application/pdf",
        nomeDoArquivo: "proposta.pdf",
      });
      const texto = await enviarTextoAoCliente(contexto, instrucoes);
      return { pdf: pdf.idMensagem, texto: texto.idMensagem };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new LoteIndisponivelError("O lote já tem uma reserva ativa");
    }
    throw error;
  }

  if (enviados) {
    await gravarMensagemDoAssistente(contexto, {
      idMensagem: enviados.pdf,
      texto: null,
      midia: {
        tipo: "documento",
        mimetype: "application/pdf",
        nomeDoArquivo: "proposta.pdf",
        url: null,
      },
    });
    await gravarMensagemDoAssistente(contexto, {
      idMensagem: enviados.texto,
      texto: instrucoes,
    });
    await mudarEtapa(session, proposta.negocioId, "aguardando_assinatura", {
      autor: "corretor",
    });
    await db
      .update(pendencias)
      .set({ estado: "resolvida", resolvidaEm: agora })
      .where(
        and(
          eq(pendencias.negocioId, proposta.negocioId),
          eq(pendencias.tipo, "revisar_proposta"),
          eq(pendencias.estado, "aberta"),
        ),
      );
  }
  const [atual] = await db
    .select(propostaColumns)
    .from(propostas)
    .where(eq(propostas.id, proposta.id));
  return atual ?? null;
}

// ---- Reserva ----------------------------------------------------------------

// Prorroga uma reserva ativa: soma horas à expiração atual ou define a nova
// (que precisa ficar no futuro). Reserva expirada → PrazoDaReservaInvalidoError.
// Fora do escopo → null.
export async function prorrogarReserva(
  session: Session,
  reservaId: string,
  prazo: { horas: number } | { expiraEm: Date },
) {
  const { corretorId } = requireCorretor(session);
  if (!z.uuid().safeParse(reservaId).success) return null;
  const [reserva] = await db
    .select({
      id: reservas.id,
      estado: reservas.estado,
      expiraEm: reservas.expiraEm,
    })
    .from(reservas)
    .innerJoin(propostas, eq(propostas.id, reservas.propostaId))
    .where(
      and(eq(reservas.id, reservaId), eq(propostas.corretorId, corretorId)),
    );
  if (!reserva) return null;
  if (reserva.estado !== "ativa") {
    throw new PrazoDaReservaInvalidoError("A reserva já expirou");
  }
  const expiraEm =
    "expiraEm" in prazo
      ? prazo.expiraEm
      : new Date(reserva.expiraEm.getTime() + prazo.horas * HORA_MS);
  if (Number.isNaN(expiraEm.getTime()) || expiraEm <= new Date()) {
    throw new PrazoDaReservaInvalidoError(
      "A nova expiração precisa ser no futuro",
    );
  }
  const [atualizada] = await db
    .update(reservas)
    .set({ expiraEm })
    .where(and(eq(reservas.id, reserva.id), eq(reservas.estado, "ativa")))
    .returning({
      id: reservas.id,
      estado: reservas.estado,
      expiraEm: reservas.expiraEm,
    });
  if (!atualizada) {
    throw new PrazoDaReservaInvalidoError("A reserva já expirou");
  }
  return atualizada;
}

// Job do worker (a cada minuto): reservas ativas vencidas expiram, o lote
// volta a disponível e a proposta fica expirada; o negócio fica onde está.
// Cada reserva é reivindicada por um update condicional: rodar de novo (ou em
// paralelo) não repete nada.
export async function expirarReservas(): Promise<{ expiradas: number }> {
  const agora = new Date();
  const vencidas = await db
    .select({ id: reservas.id })
    .from(reservas)
    .where(and(eq(reservas.estado, "ativa"), lte(reservas.expiraEm, agora)));
  let expiradas = 0;
  for (const { id } of vencidas) {
    const expirou = await db.transaction(async (tx) => {
      const [reserva] = await tx
        .update(reservas)
        .set({ estado: "expirada" })
        .where(
          and(
            eq(reservas.id, id),
            eq(reservas.estado, "ativa"),
            lte(reservas.expiraEm, agora),
          ),
        )
        .returning({
          loteId: reservas.loteId,
          propostaId: reservas.propostaId,
        });
      if (!reserva) return false;
      await tx
        .update(lotes)
        .set({ status: "disponivel" })
        .where(
          and(eq(lotes.id, reserva.loteId), eq(lotes.status, "reservado")),
        );
      await tx
        .update(propostas)
        .set({ estado: "expirada" })
        .where(
          and(
            eq(propostas.id, reserva.propostaId),
            eq(propostas.estado, "enviada"),
          ),
        );
      return true;
    });
    if (expirou) expiradas++;
  }
  return { expiradas };
}

// Para src/worker/jobs.ts.
export const jobDeExpiracaoDeReservas = {
  nome: "expiracao-de-reservas",
  executar: expirarReservas,
};
