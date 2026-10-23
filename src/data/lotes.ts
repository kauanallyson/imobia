import "server-only";
import { and, asc, eq, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { empreendimentos, lotes, type StatusDeLote } from "@/lib/db/schema";
import { buscarEmpreendimento } from "./empreendimentos";
import { isUniqueViolation } from "./errors";
import { requireCorretor, type Session } from "./session";

export type { StatusDeLote };

const columns = {
  id: lotes.id,
  empreendimentoId: lotes.empreendimentoId,
  quadra: lotes.quadra,
  numero: lotes.numero,
  area: lotes.area,
  frente: lotes.frente,
  fundo: lotes.fundo,
  preco: lotes.preco,
  status: lotes.status,
};

export type Lote = {
  id: string;
  empreendimentoId: string;
  quadra: string;
  numero: string;
  area: number;
  frente: number;
  fundo: number;
  preco: number;
  status: StatusDeLote;
};

export type MedidasDoLote = {
  quadra: string;
  numero: string;
  area: number;
  frente: number;
  fundo: number;
  preco: number;
};

// Quadra + número já existe no empreendimento.
export class LoteDuplicadoError extends Error {
  override name = "LoteDuplicadoError";
}

// Lotes herdam a imobiliária do empreendimento: toda consulta passa pelo join.
function selecionar(imobiliariaId: string, where: SQL) {
  return db
    .select(columns)
    .from(lotes)
    .innerJoin(empreendimentos, eq(empreendimentos.id, lotes.empreendimentoId))
    .where(and(eq(empreendimentos.imobiliariaId, imobiliariaId), where));
}

// Idempotente pelo `id` do formulário: o conflito sem linha devolvida é ou o
// reenvio (relê pelo id) ou outra quadra + número igual (LoteDuplicadoError).
export async function criarLote(
  session: Session,
  input: { id?: string; empreendimentoId: string } & MedidasDoLote,
): Promise<Lote | null> {
  requireCorretor(session);
  if (!(await buscarEmpreendimento(session, input.empreendimentoId))) {
    return null;
  }
  const [created] = await db
    .insert(lotes)
    .values({ ...input, status: "disponivel", criadoEm: new Date() })
    .onConflictDoNothing()
    .returning(columns);
  if (created) return created;

  const existing = input.id ? await buscarLote(session, input.id) : null;
  if (existing) return existing;
  throw new LoteDuplicadoError("Quadra e número já cadastrados");
}

export async function buscarLote(
  session: Session,
  id: string,
): Promise<Lote | null> {
  const { imobiliariaId } = requireCorretor(session);
  if (!z.uuid().safeParse(id).success) return null;
  const [found] = await selecionar(imobiliariaId, eq(lotes.id, id));
  return found ?? null;
}

export async function listarLotes(
  session: Session,
  empreendimentoId: string,
): Promise<Lote[]> {
  const { imobiliariaId } = requireCorretor(session);
  if (!z.uuid().safeParse(empreendimentoId).success) return [];
  return selecionar(
    imobiliariaId,
    eq(lotes.empreendimentoId, empreendimentoId),
  ).orderBy(asc(lotes.quadra), asc(lotes.numero));
}

export async function editarLote(
  session: Session,
  id: string,
  input: MedidasDoLote,
): Promise<Lote | null> {
  const lote = await buscarLote(session, id);
  if (!lote) return null;
  try {
    const [edited] = await db
      .update(lotes)
      .set(input)
      .where(eq(lotes.id, lote.id))
      .returning(columns);
    return edited ?? null;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new LoteDuplicadoError("Quadra e número já cadastrados");
    }
    throw error;
  }
}

// "Levar ao status X": repetir não altera nada.
export async function alterarStatusDoLote(
  session: Session,
  id: string,
  status: StatusDeLote,
): Promise<Lote | null> {
  const lote = await buscarLote(session, id);
  if (!lote) return null;
  const [updated] = await db
    .update(lotes)
    .set({ status })
    .where(eq(lotes.id, lote.id))
    .returning(columns);
  return updated ?? null;
}
