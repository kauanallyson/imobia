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
  sql,
} from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  arquivosDoFechamento,
  clientes,
  conversas,
  documentosDoCliente,
  type FormaDePagamento,
  lembretesDeColeta,
  mensagens,
  negocioEtapas,
  negocios,
  type Referencia,
  type TipoDeDocumento,
  tiposDeDocumento,
  whatsappConexoes,
} from "@/lib/db/schema";
import { partesEmBrasilia, somarDias } from "@/lib/fuso";
import * as llm from "@/lib/llm";
import * as storage from "@/lib/storage";
import * as whatsapp from "@/lib/whatsapp";
import { naJanelaDeEnvio } from "./cadencia";
import { normalizarTelefone } from "./clientes";
import { buscarLote } from "./lotes";
import { requireCorretor, type Session } from "./session";

// Coleta de dados do cliente (ticket 16): em Coletando dados o assistente
// junta documentos, referências, contatos, forma e dia de pagamento e o lote.
// Tudo é do corretor dono do negócio; as funções recebem o negócio e chegam
// ao cliente por ele.

// URL assinada dos documentos: curta (spec → Storage).
const VALIDADE_DA_URL_EM_SEGUNDOS = 300;
const PRAZO_DA_PRIMEIRA_PARCELA_EM_DIAS = 90;
const INTERVALO_DOS_LEMBRETES_EM_DIAS = 2;

export class DiaDePagamentoInvalidoError extends Error {
  override name = "DiaDePagamentoInvalidoError";
}

export class PrimeiraParcelaForaDoPrazoError extends Error {
  override name = "PrimeiraParcelaForaDoPrazoError";
}

// Lote reservado/vendido ou de outro empreendimento que não o do negócio.
export class LoteIndisponivelError extends Error {
  override name = "LoteIndisponivelError";
}

const clienteDaColetaColumns = {
  id: clientes.id,
  nome: clientes.nome,
  telefone: clientes.telefone,
  email: clientes.email,
  cpf: clientes.cpf,
  contatosExtras: clientes.contatosExtras,
  referencias: clientes.referencias,
  formaDePagamento: clientes.formaDePagamento,
  diaDePagamento: clientes.diaDePagamento,
  primeiraParcela: clientes.primeiraParcela,
  anonimizadoEm: clientes.anonimizadoEm,
};

const documentoColumns = {
  id: documentosDoCliente.id,
  tipo: documentosDoCliente.tipo,
  mimeType: documentosDoCliente.mimeType,
  legivel: documentosDoCliente.legivel,
  motivo: documentosDoCliente.motivo,
  aceito: documentosDoCliente.aceito,
  recebidoEm: documentosDoCliente.recebidoEm,
};

export type DocumentoDoCliente = {
  id: string;
  tipo: TipoDeDocumento;
  mimeType: string;
  legivel: boolean | null;
  motivo: string | null;
  aceito: boolean | null;
  recebidoEm: Date;
};

// O negócio do corretor da sessão (fora do escopo → null).
async function negocioDaSessao(session: Session, negocioId: string) {
  const { corretorId } = requireCorretor(session);
  if (!z.uuid().safeParse(negocioId).success) return null;
  const [negocio] = await db
    .select({
      id: negocios.id,
      imobiliariaId: negocios.imobiliariaId,
      corretorId: negocios.corretorId,
      clienteId: negocios.clienteId,
      etapa: negocios.etapa,
      loteInteresseId: negocios.loteInteresseId,
      empreendimentoInteresseId: negocios.empreendimentoInteresseId,
    })
    .from(negocios)
    .where(
      and(eq(negocios.id, negocioId), eq(negocios.corretorId, corretorId)),
    );
  return negocio ?? null;
}

async function lerCliente(clienteId: string) {
  const [cliente] = await db
    .select(clienteDaColetaColumns)
    .from(clientes)
    .where(eq(clientes.id, clienteId));
  if (!cliente) return null;
  const { anonimizadoEm, ...resto } = cliente;
  return { ...resto, anonimizado: anonimizadoEm !== null };
}

export type ClienteDaColeta = NonNullable<
  Awaited<ReturnType<typeof lerCliente>>
>;

const soDigitos = (texto: string) => texto.replace(/\D/g, "");

// E-mail, CPF (guardado só com dígitos) e outros contatos (acrescentados sem
// repetir). Só altera o que vier preenchido.
export async function registrarDadosDoCliente(
  session: Session,
  negocioId: string,
  dados: {
    email?: string | null;
    cpf?: string | null;
    contatosExtras?: string[] | null;
  },
): Promise<ClienteDaColeta | null> {
  const negocio = await negocioDaSessao(session, negocioId);
  if (!negocio) return null;
  const atual = await lerCliente(negocio.clienteId);
  if (!atual) return null;
  const set: Partial<typeof clientes.$inferInsert> = {};
  if (dados.email?.trim()) set.email = dados.email.trim().toLowerCase();
  if (dados.cpf && soDigitos(dados.cpf)) set.cpf = soDigitos(dados.cpf);
  const novos = (dados.contatosExtras ?? [])
    .map((c) => c.trim())
    .filter((c) => c && !atual.contatosExtras.includes(c));
  if (novos.length > 0)
    set.contatosExtras = [...atual.contatosExtras, ...novos];
  if (Object.keys(set).length > 0) {
    await db.update(clientes).set(set).where(eq(clientes.id, atual.id));
  }
  return lerCliente(atual.id);
}

// Até duas referências: o mesmo telefone atualiza o nome; uma terceira
// substitui a mais antiga.
export async function registrarReferencia(
  session: Session,
  negocioId: string,
  referencia: Referencia,
): Promise<ClienteDaColeta | null> {
  const negocio = await negocioDaSessao(session, negocioId);
  if (!negocio) return null;
  const atual = await lerCliente(negocio.clienteId);
  if (!atual) return null;
  const nova = {
    nome: referencia.nome.trim(),
    telefone: normalizarTelefone(referencia.telefone),
  };
  const referencias = atual.referencias.some(
    (r) => r.telefone === nova.telefone,
  )
    ? atual.referencias.map((r) => (r.telefone === nova.telefone ? nova : r))
    : [...atual.referencias, nova].slice(-2);
  await db
    .update(clientes)
    .set({ referencias })
    .where(eq(clientes.id, atual.id));
  return lerCliente(atual.id);
}

// Forma de pagamento e melhor dia (1–28). A primeira parcela é a data
// informada ou a próxima ocorrência do dia depois de hoje, e precisa cair em
// até 90 dias (horário de Brasília).
export async function registrarPagamento(
  session: Session,
  negocioId: string,
  pagamento: {
    forma: FormaDePagamento;
    dia: number;
    primeiraParcela?: string | null;
  },
): Promise<ClienteDaColeta | null> {
  const { dia } = pagamento;
  if (!Number.isInteger(dia) || dia < 1 || dia > 28) {
    throw new DiaDePagamentoInvalidoError(
      "O dia de pagamento deve ser de 1 a 28",
    );
  }
  const hoje = partesEmBrasilia(new Date());
  const limite = somarDias(hoje.data, PRAZO_DA_PRIMEIRA_PARCELA_EM_DIAS);
  let primeiraParcela: string;
  if (pagamento.primeiraParcela) {
    primeiraParcela = pagamento.primeiraParcela;
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(primeiraParcela) ||
      Number.isNaN(Date.parse(primeiraParcela)) ||
      primeiraParcela <= hoje.data ||
      primeiraParcela > limite
    ) {
      throw new PrimeiraParcelaForaDoPrazoError(
        `A primeira parcela deve ser depois de hoje e até ${limite}`,
      );
    }
  } else {
    const [ano, mes] =
      hoje.dia < dia
        ? [hoje.ano, hoje.mes]
        : hoje.mes === 12
          ? [hoje.ano + 1, 1]
          : [hoje.ano, hoje.mes + 1];
    primeiraParcela = `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  }

  const negocio = await negocioDaSessao(session, negocioId);
  if (!negocio) return null;
  await db
    .update(clientes)
    .set({
      formaDePagamento: pagamento.forma,
      diaDePagamento: dia,
      primeiraParcela,
    })
    .where(eq(clientes.id, negocio.clienteId));
  return lerCliente(negocio.clienteId);
}

// "Levar ao lote X": só lote disponível do empreendimento do negócio (ou de
// qualquer empreendimento da imobiliária, se o negócio ainda não tem um).
// Lote de outra imobiliária ou negócio fora do escopo → null.
export async function escolherLote(
  session: Session,
  negocioId: string,
  loteId: string,
) {
  const negocio = await negocioDaSessao(session, negocioId);
  if (!negocio) return null;
  const lote = await buscarLote(session, loteId);
  if (!lote) return null;
  if (
    lote.status !== "disponivel" ||
    (negocio.empreendimentoInteresseId &&
      lote.empreendimentoId !== negocio.empreendimentoInteresseId)
  ) {
    throw new LoteIndisponivelError(
      `O lote ${lote.quadra}-${lote.numero} não está disponível para este negócio`,
    );
  }
  const [atualizado] = await db
    .update(negocios)
    .set({
      loteInteresseId: lote.id,
      empreendimentoInteresseId: lote.empreendimentoId,
      atualizadoEm: new Date(),
    })
    .where(eq(negocios.id, negocio.id))
    .returning({
      id: negocios.id,
      loteInteresseId: negocios.loteInteresseId,
      empreendimentoInteresseId: negocios.empreendimentoInteresseId,
    });
  return atualizado ? { ...atualizado, lote } : null;
}

// --- Documentos ---------------------------------------------------------------

async function lerDocumento(where: ReturnType<typeof eq>) {
  const [found] = await db
    .select(documentoColumns)
    .from(documentosDoCliente)
    .where(where);
  return found ?? null;
}

// Registra como documento `tipo` a última foto ou arquivo que o cliente
// mandou na conversa: baixa da Evolution, guarda privado no R2 e pede ao
// modelo multimodal uma avaliação de legibilidade (falha → sem veredito). A
// mensagem de origem é a chave natural: repetir devolve o já registrado.
// Sem mídia recebida (ou sem conversa) → null.
export async function registrarDocumentoRecebido(
  session: Session,
  negocioId: string,
  tipo: TipoDeDocumento,
): Promise<DocumentoDoCliente | null> {
  const negocio = await negocioDaSessao(session, negocioId);
  if (!negocio) return null;

  // Fotos e arquivos do cliente desde a entrada em Coletando dados, do mais
  // antigo para o mais novo: cada chamada registra o primeiro ainda sem
  // documento (o cliente pode mandar CPF e RG de uma vez). Sem nenhum
  // pendente, a chamada repetida devolve o último já registrado.
  const [entrada] = await db
    .select({ em: max(negocioEtapas.em) })
    .from(negocioEtapas)
    .where(
      and(
        eq(negocioEtapas.negocioId, negocio.id),
        eq(negocioEtapas.para, "coletando_dados"),
      ),
    );
  const recebidas = await db
    .select({
      id: mensagens.id,
      evolutionId: mensagens.evolutionId,
      documentoId: documentosDoCliente.id,
    })
    .from(mensagens)
    .innerJoin(conversas, eq(conversas.id, mensagens.conversaId))
    .leftJoin(
      documentosDoCliente,
      eq(documentosDoCliente.mensagemId, mensagens.id),
    )
    .where(
      and(
        eq(conversas.clienteId, negocio.clienteId),
        eq(conversas.corretorId, negocio.corretorId),
        eq(mensagens.autor, "cliente"),
        inArray(sql`${mensagens.midia}->>'tipo'`, ["imagem", "documento"]),
        entrada?.em ? gte(mensagens.enviadaEm, entrada.em) : undefined,
      ),
    )
    .orderBy(asc(mensagens.enviadaEm), asc(mensagens.criadaEm));
  const midia = recebidas.find((m) => !m.documentoId);
  if (!midia) {
    const ultima = recebidas.at(-1);
    return ultima?.documentoId
      ? lerDocumento(eq(documentosDoCliente.id, ultima.documentoId))
      : null;
  }

  const [conexao] = await db
    .select({ instancia: whatsappConexoes.instancia })
    .from(whatsappConexoes)
    .where(eq(whatsappConexoes.corretorId, negocio.corretorId));
  if (!conexao?.instancia) return null;

  const arquivo = await whatsapp.baixarMidia(
    conexao.instancia,
    midia.evolutionId ?? "",
  );
  const chave = `imobiliarias/${negocio.imobiliariaId}/clientes/${negocio.clienteId}/documentos/${crypto.randomUUID()}`;
  await storage.salvarArquivo(chave, arquivo.bytes, arquivo.mimeType);

  const [criado] = await db
    .insert(documentosDoCliente)
    .values({
      imobiliariaId: negocio.imobiliariaId,
      corretorId: negocio.corretorId,
      clienteId: negocio.clienteId,
      negocioId: negocio.id,
      tipo,
      chave,
      mimeType: arquivo.mimeType,
      mensagemId: midia.id,
      recebidoEm: new Date(),
    })
    .onConflictDoNothing({ target: documentosDoCliente.mensagemId })
    .returning({ id: documentosDoCliente.id });
  if (!criado) {
    // Outro processo registrou a mesma mensagem antes: fica o dele.
    await storage.apagarArquivo(chave);
    return lerDocumento(eq(documentosDoCliente.mensagemId, midia.id));
  }

  try {
    const avaliacao = await llm.avaliarLegibilidade({ ...arquivo, tipo });
    await db
      .update(documentosDoCliente)
      .set({ legivel: avaliacao.legivel, motivo: avaliacao.motivo })
      .where(eq(documentosDoCliente.id, criado.id));
  } catch (error) {
    console.error("coleta: falha ao avaliar a legibilidade", error);
  }
  return lerDocumento(eq(documentosDoCliente.id, criado.id));
}

// Decisão do corretor sobre o documento ("levar a aceito/rejeitado").
export async function avaliarDocumento(
  session: Session,
  documentoId: string,
  aceito: boolean,
): Promise<DocumentoDoCliente | null> {
  const { corretorId } = requireCorretor(session);
  if (!z.uuid().safeParse(documentoId).success) return null;
  const [atualizado] = await db
    .update(documentosDoCliente)
    .set({ aceito })
    .where(
      and(
        eq(documentosDoCliente.id, documentoId),
        eq(documentosDoCliente.corretorId, corretorId),
      ),
    )
    .returning(documentoColumns);
  return atualizado ?? null;
}

// --- Status -------------------------------------------------------------------

export const itensDaColeta = [
  "documento_cpf",
  "documento_rg",
  "documento_comprovante_endereco",
  "email",
  "cpf",
  "referencias",
  "forma_de_pagamento",
  "dia_de_pagamento",
  "lote",
] as const;
export type ItemDaColeta = (typeof itensDaColeta)[number];

export const rotuloDoItem: Record<ItemDaColeta, string> = {
  documento_cpf: "foto do CPF",
  documento_rg: "foto do RG",
  documento_comprovante_endereco: "comprovante de endereço",
  email: "e-mail",
  cpf: "número do CPF",
  referencias: "dois contatos de referência (nome e telefone)",
  forma_de_pagamento: "forma de pagamento (cartão ou Pix)",
  dia_de_pagamento: "melhor dia do mês para pagamento",
  lote: "escolha do lote",
};

// Um documento conta quando o corretor aceitou, ou quando ainda não decidiu
// e a IA não o sinalizou como ilegível.
function documentoConta(d: Pick<DocumentoDoCliente, "aceito" | "legivel">) {
  return d.aceito === true || (d.aceito === null && d.legivel !== false);
}

function calcularFaltando(
  cliente: ClienteDaColeta,
  documentos: Array<Pick<DocumentoDoCliente, "tipo" | "aceito" | "legivel">>,
  loteInteresseId: string | null,
): ItemDaColeta[] {
  const faltando: ItemDaColeta[] = [];
  for (const tipo of tiposDeDocumento) {
    if (!documentos.some((d) => d.tipo === tipo && documentoConta(d))) {
      faltando.push(`documento_${tipo}`);
    }
  }
  if (!cliente.email) faltando.push("email");
  if (!cliente.cpf) faltando.push("cpf");
  if (cliente.referencias.length < 2) faltando.push("referencias");
  if (!cliente.formaDePagamento) faltando.push("forma_de_pagamento");
  if (!cliente.diaDePagamento) faltando.push("dia_de_pagamento");
  if (!loteInteresseId) faltando.push("lote");
  return faltando;
}

async function documentosDoNegocio(negocioId: string) {
  return db
    .select({ ...documentoColumns, chave: documentosDoCliente.chave })
    .from(documentosDoCliente)
    .where(eq(documentosDoCliente.negocioId, negocioId))
    .orderBy(desc(documentosDoCliente.recebidoEm));
}

export async function statusDaColeta(session: Session, negocioId: string) {
  const negocio = await negocioDaSessao(session, negocioId);
  if (!negocio) return null;
  const cliente = await lerCliente(negocio.clienteId);
  if (!cliente) return null;
  const faltando = calcularFaltando(
    cliente,
    await documentosDoNegocio(negocio.id),
    negocio.loteInteresseId,
  );
  return { completa: faltando.length === 0, faltando };
}

// Para o corretor no detalhe do negócio: dados coletados, documentos com URL
// assinada de curta duração (a chave nunca sai daqui) e o que falta.
export async function buscarColeta(session: Session, negocioId: string) {
  const negocio = await negocioDaSessao(session, negocioId);
  if (!negocio) return null;
  const cliente = await lerCliente(negocio.clienteId);
  if (!cliente) return null;
  const lista = await documentosDoNegocio(negocio.id);
  const faltando = calcularFaltando(cliente, lista, negocio.loteInteresseId);
  return {
    cliente,
    documentos: lista.map(({ chave, ...documento }) => ({
      ...documento,
      url: storage.urlAssinada(chave, VALIDADE_DA_URL_EM_SEGUNDOS),
    })),
    faltando,
  };
}

// --- Exclusão (LGPD) ----------------------------------------------------------

export const NOME_DO_CLIENTE_REMOVIDO = "Cliente removido";

// A pedido do cliente: apaga os arquivos do R2, os documentos, as mensagens da
// conversa e os dados identificáveis; a linha do cliente fica anonimizada
// para que negócios (e propostas) sigam no histórico. O assistente é
// desligado na conversa. Repetir não falha. Fora do escopo → null.
export async function apagarDadosDoCliente(
  session: Session,
  clienteId: string,
) {
  const { corretorId } = requireCorretor(session);
  if (!z.uuid().safeParse(clienteId).success) return null;
  const [cliente] = await db
    .select({ id: clientes.id, anonimizadoEm: clientes.anonimizadoEm })
    .from(clientes)
    .where(
      and(eq(clientes.id, clienteId), eq(clientes.corretorId, corretorId)),
    );
  if (!cliente) return null;

  const docs = await db
    .select({ chave: documentosDoCliente.chave })
    .from(documentosDoCliente)
    .where(eq(documentosDoCliente.clienteId, cliente.id));
  // Ticket 18: proposta assinada e comprovantes também são dados pessoais.
  const doFechamento = await db
    .select({ chave: arquivosDoFechamento.chave })
    .from(arquivosDoFechamento)
    .innerJoin(negocios, eq(negocios.id, arquivosDoFechamento.negocioId))
    .where(eq(negocios.clienteId, cliente.id));
  // Arquivos primeiro: se o banco falhar depois, repetir apaga o resto.
  for (const { chave } of [...docs, ...doFechamento]) {
    await storage.apagarArquivo(chave);
  }

  const anonimizadoEm = cliente.anonimizadoEm ?? new Date();
  await db.transaction(async (tx) => {
    await tx
      .delete(documentosDoCliente)
      .where(eq(documentosDoCliente.clienteId, cliente.id));
    const daConversa = await tx
      .update(conversas)
      .set({ assistente: "desligado" })
      .where(
        and(
          eq(conversas.clienteId, cliente.id),
          eq(conversas.corretorId, corretorId),
        ),
      )
      .returning({ id: conversas.id });
    if (daConversa.length > 0) {
      await tx.delete(mensagens).where(
        inArray(
          mensagens.conversaId,
          daConversa.map((c) => c.id),
        ),
      );
    }
    await tx
      .update(clientes)
      .set({
        nome: NOME_DO_CLIENTE_REMOVIDO,
        // Mantém a unique (corretor, telefone) sem guardar o número.
        telefone: `removido-${cliente.id}`,
        email: null,
        cpf: null,
        contatosExtras: [],
        referencias: [],
        formaDePagamento: null,
        diaDePagamento: null,
        primeiraParcela: null,
        anonimizadoEm,
      })
      .where(eq(clientes.id, cliente.id));
  });
  return { id: cliente.id, anonimizadoEm };
}

// --- Lembretes (worker) -------------------------------------------------------

export function textoDoLembreteDeColeta(faltando: ItemDaColeta[]) {
  const itens = faltando.map((i) => `- ${rotuloDoItem[i]}`).join("\n");
  return `Oi! Para seguir com a sua compra, ainda falta:\n${itens}\nPode me enviar quando puder?`;
}

// Spec → Follow-up: em Coletando dados, a cada 2 dias (contados da entrada na
// etapa e depois do último lembrete) enquanto faltar algo, só 8h–20h de
// segunda a sábado. Chave natural negócio + data: rodar de novo não reenvia;
// falha no envio desfaz a marcação. Conversa pausada, desligada ou com
// opt-out não recebe.
export async function enviarLembretesDeColeta(): Promise<{ enviados: number }> {
  const agora = new Date();
  if (!naJanelaDeEnvio(agora)) return { enviados: 0 };
  const hoje = partesEmBrasilia(agora).data;

  const candidatos = await db
    .select({
      negocioId: negocios.id,
      corretorId: negocios.corretorId,
      imobiliariaId: negocios.imobiliariaId,
      conversaId: conversas.id,
      telefone: clientes.telefone,
      instancia: whatsappConexoes.instancia,
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
    .innerJoin(
      whatsappConexoes,
      eq(whatsappConexoes.corretorId, negocios.corretorId),
    )
    .where(
      and(
        eq(negocios.etapa, "coletando_dados"),
        eq(conversas.assistente, "ativo"),
        eq(conversas.optOut, false),
        isNull(clientes.anonimizadoEm),
      ),
    );

  let enviados = 0;
  for (const c of candidatos) {
    if (!c.instancia) continue;
    const [entrada] = await db
      .select({ em: max(negocioEtapas.em) })
      .from(negocioEtapas)
      .where(
        and(
          eq(negocioEtapas.negocioId, c.negocioId),
          eq(negocioEtapas.para, "coletando_dados"),
        ),
      );
    if (!entrada?.em) continue;
    const diaDaEntrada = partesEmBrasilia(entrada.em).data;
    const [ultimo] = await db
      .select({ data: max(lembretesDeColeta.data) })
      .from(lembretesDeColeta)
      .where(
        and(
          eq(lembretesDeColeta.negocioId, c.negocioId),
          gte(lembretesDeColeta.data, diaDaEntrada),
        ),
      );
    const base = ultimo?.data ?? diaDaEntrada;
    if (hoje < somarDias(base, INTERVALO_DOS_LEMBRETES_EM_DIAS)) continue;

    const status = await statusDaColeta(
      {
        role: "corretor",
        corretorId: c.corretorId,
        imobiliariaId: c.imobiliariaId,
      },
      c.negocioId,
    );
    if (!status || status.completa) continue;

    const instancia = c.instancia;
    try {
      const enviou = await db.transaction(async (tx) => {
        const [marcado] = await tx
          .insert(lembretesDeColeta)
          .values({ negocioId: c.negocioId, data: hoje, enviadoEm: agora })
          .onConflictDoNothing()
          .returning({ id: lembretesDeColeta.id });
        if (!marcado) return false;
        const texto = textoDoLembreteDeColeta(status.faltando);
        const { idMensagem } = await whatsapp.enviarTexto(
          instancia,
          c.telefone,
          texto,
        );
        await tx
          .insert(mensagens)
          .values({
            conversaId: c.conversaId,
            evolutionId: idMensagem,
            autor: "assistente",
            texto,
            fromMe: true,
            enviadaEm: agora,
            criadaEm: agora,
          })
          .onConflictDoNothing({
            target: [mensagens.conversaId, mensagens.evolutionId],
          });
        return true;
      });
      if (enviou) enviados++;
    } catch (error) {
      console.error("coleta: falha ao enviar o lembrete", error);
    }
  }
  return { enviados };
}

// Para src/worker/jobs.ts.
export const jobDeLembretesDeColeta = {
  nome: "lembretes-de-coleta",
  executar: enviarLembretesDeColeta,
};
