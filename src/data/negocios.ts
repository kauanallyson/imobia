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
  lotes,
  mensagens,
  negocioEtapas,
  negocios,
} from "@/lib/db/schema";
import { requireCorretor, type Session } from "./session";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const negocioColumns = {
  id: negocios.id,
  clienteId: negocios.clienteId,
  etapa: negocios.etapa,
  motivoPerda: negocios.motivoPerda,
  loteInteresseId: negocios.loteInteresseId,
  criadoEm: negocios.criadoEm,
  atualizadoEm: negocios.atualizadoEm,
};

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
    .select({ id: conversas.id, assistente: conversas.assistente })
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

  return {
    ...negocio,
    cliente,
    lote: lote ?? null,
    conversa: conversa ? { ...conversa, mensagens: listaDeMensagens } : null,
    historico,
  };
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
