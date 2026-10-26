import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  type AutorDeEtapa,
  clientes,
  conversas,
  type Etapa,
  empreendimentos,
  etapas,
  type Interesse,
  lotes,
  mensagens,
  negocioEtapas,
  negocios,
} from "@/lib/db/schema";
import { buscarLote } from "./lotes";
import { buscarModeloDeCasa } from "./modelos-de-casa";
import {
  buscarPlanoDePagamento,
  calcularPlanoParaLote,
} from "./planos-de-pagamento";
import { requireCorretor, type Session } from "./session";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const negocioColumns = {
  id: negocios.id,
  clienteId: negocios.clienteId,
  etapa: negocios.etapa,
  motivoPerda: negocios.motivoPerda,
  loteInteresseId: negocios.loteInteresseId,
  empreendimentoInteresseId: negocios.empreendimentoInteresseId,
  interesse: negocios.interesse,
  orcamentoEntrada: negocios.orcamentoEntrada,
  orcamentoParcelaMaxima: negocios.orcamentoParcelaMaxima,
  foraDoOrcamento: negocios.foraDoOrcamento,
  planoEscolhidoId: negocios.planoEscolhidoId,
  modeloDeCasaEscolhidoId: negocios.modeloDeCasaEscolhidoId,
  criadoEm: negocios.criadoEm,
  atualizadoEm: negocios.atualizadoEm,
};

// O negócio do corretor da sessão com o que coleta, proposta e fechamento
// precisam para agir nele (escopo, cliente, etapa e escolhas). Fora do
// escopo ou id inválido → null.
export async function negocioDoCorretor(session: Session, negocioId: string) {
  const { corretorId } = requireCorretor(session);
  if (!z.uuid().safeParse(negocioId).success) return null;
  const [negocio] = await db
    .select({
      id: negocios.id,
      imobiliariaId: negocios.imobiliariaId,
      corretorId: negocios.corretorId,
      clienteId: negocios.clienteId,
      clienteNome: clientes.nome,
      etapa: negocios.etapa,
      interesse: negocios.interesse,
      empreendimentoInteresseId: negocios.empreendimentoInteresseId,
      loteInteresseId: negocios.loteInteresseId,
      planoEscolhidoId: negocios.planoEscolhidoId,
      modeloDeCasaEscolhidoId: negocios.modeloDeCasaEscolhidoId,
    })
    .from(negocios)
    .innerJoin(clientes, eq(clientes.id, negocios.clienteId))
    .where(
      and(eq(negocios.id, negocioId), eq(negocios.corretorId, corretorId)),
    );
  return negocio ?? null;
}

export type NegocioDoCorretor = NonNullable<
  Awaited<ReturnType<typeof negocioDoCorretor>>
>;

export class MotivoObrigatorioError extends Error {
  override name = "MotivoObrigatorioError";
}

// Perdido só via `marcarPerdido` (exige motivo).
export class EtapaInvalidaError extends Error {
  override name = "EtapaInvalidaError";
}

// Todo negócio nasce em Novo com a primeira linha do histórico. Usado dentro
// da transação de quem o cria (mensagem de número novo, cadastro manual).
// Com `id` é idempotente: devolve null se já existia (quem chama relê).
export async function inserirNegocioEmNovo(
  tx: Tx,
  input: {
    id?: string;
    imobiliariaId: string;
    corretorId: string;
    clienteId: string;
    loteInteresseId?: string | null;
    autor?: AutorDeEtapa;
  },
) {
  const agora = new Date();
  const [negocio] = await tx
    .insert(negocios)
    .values({
      id: input.id,
      imobiliariaId: input.imobiliariaId,
      corretorId: input.corretorId,
      clienteId: input.clienteId,
      loteInteresseId: input.loteInteresseId ?? null,
      etapa: "novo",
      criadoEm: agora,
      atualizadoEm: agora,
    })
    .onConflictDoNothing({ target: negocios.id })
    .returning(negocioColumns);
  if (!negocio) {
    if (input.id) return null;
    throw new Error("negócio não inserido");
  }
  await tx.insert(negocioEtapas).values({
    negocioId: negocio.id,
    de: null,
    para: "novo",
    autor: input.autor ?? "sistema",
    em: agora,
  });
  return negocio;
}

// Cadastro manual (história 29/35): o cliente precisa ser do corretor,
// senão null. Um cliente pode ter vários negócios.
export async function criarNegocio(
  session: Session,
  input: { id?: string; clienteId: string; loteInteresseId?: string | null },
) {
  const { corretorId, imobiliariaId } = requireCorretor(session);
  if (!z.uuid().safeParse(input.clienteId).success) return null;
  const [cliente] = await db
    .select({ id: clientes.id })
    .from(clientes)
    .where(
      and(
        eq(clientes.id, input.clienteId),
        eq(clientes.corretorId, corretorId),
      ),
    );
  if (!cliente) return null;

  const created = await db.transaction((tx) =>
    inserirNegocioEmNovo(tx, {
      id: input.id,
      imobiliariaId,
      corretorId,
      clienteId: cliente.id,
      loteInteresseId: input.loteInteresseId,
      autor: "corretor",
    }),
  );
  if (created || !input.id) return created;
  return buscarNegocioResumido(session, input.id);
}

async function buscarNegocioResumido(session: Session, id: string) {
  const { corretorId } = requireCorretor(session);
  if (!z.uuid().safeParse(id).success) return null;
  const [found] = await db
    .select(negocioColumns)
    .from(negocios)
    .where(and(eq(negocios.id, id), eq(negocios.corretorId, corretorId)));
  return found ?? null;
}

// O assistente (ou o corretor) registra o que o cliente procura e sobre qual
// empreendimento conversam. Empreendimento de outra imobiliária → null.
export async function registrarInteresse(
  session: Session,
  negocioId: string,
  input: { interesse?: Interesse | null; empreendimentoId?: string | null },
) {
  const { corretorId, imobiliariaId } = requireCorretor(session);
  if (!z.uuid().safeParse(negocioId).success) return null;
  const set: Partial<{
    interesse: Interesse;
    empreendimentoInteresseId: string;
    atualizadoEm: Date;
  }> = {};
  if (input.interesse) set.interesse = input.interesse;
  if (input.empreendimentoId) {
    if (!z.uuid().safeParse(input.empreendimentoId).success) return null;
    const [empreendimento] = await db
      .select({ id: empreendimentos.id })
      .from(empreendimentos)
      .where(
        and(
          eq(empreendimentos.id, input.empreendimentoId),
          eq(empreendimentos.imobiliariaId, imobiliariaId),
        ),
      );
    if (!empreendimento) return null;
    set.empreendimentoInteresseId = empreendimento.id;
  }
  if (Object.keys(set).length === 0) {
    return buscarNegocioResumido(session, negocioId);
  }
  set.atualizadoEm = new Date();
  const [updated] = await db
    .update(negocios)
    .set(set)
    .where(and(eq(negocios.id, negocioId), eq(negocios.corretorId, corretorId)))
    .returning(negocioColumns);
  return updated ?? null;
}

export async function listarNegocios(session: Session) {
  const { corretorId } = requireCorretor(session);
  return db
    .select({
      ...negocioColumns,
      clienteNome: clientes.nome,
      clienteTelefone: clientes.telefone,
    })
    .from(negocios)
    .innerJoin(clientes, eq(clientes.id, negocios.clienteId))
    .where(eq(negocios.corretorId, corretorId))
    .orderBy(desc(negocios.atualizadoEm));
}

export type NegocioDoQuadro = Awaited<
  ReturnType<typeof listarNegocios>
>[number];

// O quadro (história 30): sempre todas as etapas fixas, na ordem do funil,
// mesmo vazias.
export async function listarNegociosPorEtapa(session: Session) {
  const lista = await listarNegocios(session);
  const quadro = Object.fromEntries(
    etapas.map((etapa) => [etapa, [] as NegocioDoQuadro[]]),
  ) as Record<Etapa, NegocioDoQuadro[]>;
  for (const negocio of lista) quadro[negocio.etapa].push(negocio);
  return quadro;
}

export async function historicoDeEtapas(session: Session, negocioId: string) {
  const { corretorId } = requireCorretor(session);
  if (!z.uuid().safeParse(negocioId).success) return [];
  return db
    .select({
      de: negocioEtapas.de,
      para: negocioEtapas.para,
      autor: negocioEtapas.autor,
      em: negocioEtapas.em,
    })
    .from(negocioEtapas)
    .innerJoin(negocios, eq(negocios.id, negocioEtapas.negocioId))
    .where(and(eq(negocios.id, negocioId), eq(negocios.corretorId, corretorId)))
    .orderBy(asc(negocioEtapas.em), asc(negocioEtapas.id));
}

// Detalhe (história 31): cliente, conversa com mensagens e transcrições,
// lote de interesse e histórico. Sem conversa quando cadastrado à mão.
export async function buscarNegocio(session: Session, id: string) {
  const { corretorId } = requireCorretor(session);
  const negocio = await buscarNegocioResumido(session, id);
  if (!negocio) return null;

  const [cliente] = await db
    .select({
      id: clientes.id,
      nome: clientes.nome,
      telefone: clientes.telefone,
      email: clientes.email,
      cpf: clientes.cpf,
    })
    .from(clientes)
    .where(eq(clientes.id, negocio.clienteId));
  if (!cliente) return null;

  const [conversa] = await db
    .select({
      id: conversas.id,
      assistente: conversas.assistente,
      optOut: conversas.optOut,
    })
    .from(conversas)
    .where(
      and(
        eq(conversas.clienteId, cliente.id),
        eq(conversas.corretorId, corretorId),
      ),
    );
  const listaDeMensagens = conversa
    ? await db
        .select({
          id: mensagens.id,
          autor: mensagens.autor,
          texto: mensagens.texto,
          midia: mensagens.midia,
          transcricao: mensagens.transcricao,
          enviadaEm: mensagens.enviadaEm,
        })
        .from(mensagens)
        .where(eq(mensagens.conversaId, conversa.id))
        .orderBy(asc(mensagens.enviadaEm), asc(mensagens.criadaEm))
    : [];
  const historico = await historicoDeEtapas(session, negocio.id);

  // Lote de interesse com quadra, número e empreendimento (catálogo da
  // imobiliária).
  const [lote] = negocio.loteInteresseId
    ? await db
        .select({
          id: lotes.id,
          quadra: lotes.quadra,
          numero: lotes.numero,
          status: lotes.status,
          empreendimentoId: empreendimentos.id,
          empreendimentoNome: empreendimentos.nome,
        })
        .from(lotes)
        .innerJoin(
          empreendimentos,
          eq(empreendimentos.id, lotes.empreendimentoId),
        )
        .where(eq(lotes.id, negocio.loteInteresseId))
    : [];

  // Plano escolhido (ticket 12) com o cálculo para o lote de interesse,
  // quando há lote; os valores vêm só de `calcularPlano`.
  const planoEscolhido = negocio.planoEscolhidoId
    ? await planoEscolhidoDoNegocio(session, negocio)
    : null;

  return {
    ...negocio,
    cliente,
    lote: lote ?? null,
    planoEscolhido,
    conversa: conversa ? { ...conversa, mensagens: listaDeMensagens } : null,
    historico,
  };
}

async function planoEscolhidoDoNegocio(
  session: Session,
  negocio: {
    planoEscolhidoId: string | null;
    loteInteresseId: string | null;
    modeloDeCasaEscolhidoId: string | null;
  },
) {
  if (!negocio.planoEscolhidoId) return null;
  const plano = await buscarPlanoDePagamento(session, negocio.planoEscolhidoId);
  if (!plano) return null;
  const calculo = negocio.loteInteresseId
    ? await calcularPlanoParaLote(session, {
        loteId: negocio.loteInteresseId,
        planoId: plano.id,
        modeloDeCasaId: negocio.modeloDeCasaEscolhidoId ?? undefined,
      })
    : null;
  return { id: plano.id, nome: plano.nome, calculo };
}

export type NegocioDetalhado = NonNullable<
  Awaited<ReturnType<typeof buscarNegocio>>
>;

// "Levar à etapa X": tranca a linha, não faz nada se já está lá (sem entrada
// nova no histórico), senão grava a mudança. Fora do escopo → null.
async function irParaEtapa(
  session: Session,
  negocioId: string,
  para: Etapa,
  opcoes: {
    autor: AutorDeEtapa;
    motivoPerda?: string | null;
    // Permite calcular o destino a partir do estado atual (reabrir).
    destino?: (atual: {
      etapa: Etapa;
      historico: Array<{ de: Etapa | null; para: Etapa }>;
    }) => Etapa;
  },
) {
  const { corretorId } = requireCorretor(session);
  if (!z.uuid().safeParse(negocioId).success) return null;

  return db.transaction(async (tx) => {
    const [atual] = await tx
      .select(negocioColumns)
      .from(negocios)
      .where(
        and(eq(negocios.id, negocioId), eq(negocios.corretorId, corretorId)),
      )
      .for("update");
    if (!atual) return null;

    let alvo = para;
    if (opcoes.destino) {
      const historico = await tx
        .select({ de: negocioEtapas.de, para: negocioEtapas.para })
        .from(negocioEtapas)
        .where(eq(negocioEtapas.negocioId, negocioId))
        .orderBy(asc(negocioEtapas.em), asc(negocioEtapas.id));
      alvo = opcoes.destino({ etapa: atual.etapa, historico });
    }
    if (atual.etapa === alvo) return atual;

    const agora = new Date();
    const [alterado] = await tx
      .update(negocios)
      .set({
        etapa: alvo,
        motivoPerda: alvo === "perdido" ? (opcoes.motivoPerda ?? null) : null,
        atualizadoEm: agora,
      })
      .where(eq(negocios.id, negocioId))
      .returning(negocioColumns);
    await tx.insert(negocioEtapas).values({
      negocioId,
      de: atual.etapa,
      para: alvo,
      autor: opcoes.autor,
      em: agora,
    });
    return alterado ?? null;
  });
}

// Mudança manual ou pelo assistente (histórias 32, 45, 71). Perdido não passa
// por aqui: só o corretor, com motivo, em `marcarPerdido`.
export async function mudarEtapa(
  session: Session,
  negocioId: string,
  etapa: Exclude<Etapa, "perdido">,
  opcoes: { autor?: AutorDeEtapa } = {},
) {
  if ((etapa as Etapa) === "perdido") {
    throw new EtapaInvalidaError("Use marcarPerdido para levar a Perdido");
  }
  return irParaEtapa(session, negocioId, etapa, {
    autor: opcoes.autor ?? "corretor",
  });
}

// História 33: Perdido exige motivo. Já perdido: mantém o motivo original.
export async function marcarPerdido(
  session: Session,
  negocioId: string,
  motivo: string,
  opcoes: { autor?: AutorDeEtapa } = {},
) {
  const motivoPerda = motivo.trim();
  if (!motivoPerda) {
    throw new MotivoObrigatorioError("Informe o motivo da perda");
  }
  return irParaEtapa(session, negocioId, "perdido", {
    autor: opcoes.autor ?? "corretor",
    motivoPerda,
  });
}

// História 34: volta à etapa em que estava antes de Perdido (ou Novo).
// Negócio aberto: não muda nada.
export async function reabrir(session: Session, negocioId: string) {
  return irParaEtapa(session, negocioId, "novo", {
    autor: "corretor",
    destino: ({ etapa, historico }) => {
      if (etapa !== "perdido") return etapa;
      const perda = historico.findLast((h) => h.para === "perdido");
      return perda?.de ?? "novo";
    },
  });
}

// ---- ticket 12: orçamento e plano escolhido --------------------------------

// O que o cliente pode pagar, em centavos (como as colunas). Repetir com os
// mesmos valores não altera nada além de `atualizadoEm`.
export async function registrarOrcamento(
  session: Session,
  negocioId: string,
  orcamento: { entrada: number; parcelaMaxima: number },
) {
  const { corretorId } = requireCorretor(session);
  if (!z.uuid().safeParse(negocioId).success) return null;
  const [updated] = await db
    .update(negocios)
    .set({
      orcamentoEntrada: Math.max(0, Math.round(orcamento.entrada)),
      orcamentoParcelaMaxima: Math.max(0, Math.round(orcamento.parcelaMaxima)),
      // Novo orçamento: a avaliação anterior deixa de valer.
      foraDoOrcamento: false,
      atualizadoEm: new Date(),
    })
    .where(and(eq(negocios.id, negocioId), eq(negocios.corretorId, corretorId)))
    .returning(negocioColumns);
  return updated ?? null;
}

// "Levar ao plano X" (e, se informados, ao lote e modelo de interesse). Tudo
// precisa estar na imobiliária e no mesmo empreendimento; senão null. Mesmos
// valores → nada muda.
export async function escolherPlano(
  session: Session,
  negocioId: string,
  input: {
    planoId: string;
    loteId?: string | null;
    modeloDeCasaId?: string | null;
  },
) {
  const { corretorId } = requireCorretor(session);
  if (!z.uuid().safeParse(negocioId).success) return null;
  const plano = await buscarPlanoDePagamento(session, input.planoId);
  if (!plano) return null;
  const lote = input.loteId ? await buscarLote(session, input.loteId) : null;
  if (input.loteId && !lote) return null;
  if (lote && lote.empreendimentoId !== plano.empreendimentoId) return null;
  const modelo = input.modeloDeCasaId
    ? await buscarModeloDeCasa(session, input.modeloDeCasaId)
    : null;
  if (input.modeloDeCasaId && !modelo) return null;
  if (modelo && modelo.empreendimentoId !== plano.empreendimentoId) return null;

  const atual = await buscarNegocioResumido(session, negocioId);
  if (!atual) return null;
  const set = {
    planoEscolhidoId: plano.id,
    empreendimentoInteresseId: plano.empreendimentoId,
    loteInteresseId: lote?.id ?? atual.loteInteresseId,
    modeloDeCasaEscolhidoId:
      modelo?.id ?? (lote ? null : atual.modeloDeCasaEscolhidoId),
    interesse: modelo
      ? ("lote_e_casa" as const)
      : lote
        ? ("lote" as const)
        : atual.interesse,
  };
  if (
    set.planoEscolhidoId === atual.planoEscolhidoId &&
    set.empreendimentoInteresseId === atual.empreendimentoInteresseId &&
    set.loteInteresseId === atual.loteInteresseId &&
    set.modeloDeCasaEscolhidoId === atual.modeloDeCasaEscolhidoId &&
    set.interesse === atual.interesse
  ) {
    return atual;
  }
  const [updated] = await db
    .update(negocios)
    .set({ ...set, atualizadoEm: new Date() })
    .where(and(eq(negocios.id, negocioId), eq(negocios.corretorId, corretorId)))
    .returning(negocioColumns);
  return updated ?? null;
}

// Nada coube no orçamento: o negócio segue aberto, só marcado. Repetir não
// altera.
export async function marcarForaDoOrcamento(
  session: Session,
  negocioId: string,
) {
  const atual = await buscarNegocioResumido(session, negocioId);
  if (!atual) return null;
  if (atual.foraDoOrcamento) return atual;
  const [updated] = await db
    .update(negocios)
    .set({ foraDoOrcamento: true, atualizadoEm: new Date() })
    .where(eq(negocios.id, atual.id))
    .returning(negocioColumns);
  return updated ?? null;
}

// Resumo do negócio para o assistente (orçamento, interesse, plano).
export async function buscarResumoDoNegocio(
  session: Session,
  negocioId: string,
) {
  return buscarNegocioResumido(session, negocioId);
}
