import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { incorporadoras } from "@/lib/db/schema";
import { requireCorretor, type Session } from "./session";

const columns = {
  id: incorporadoras.id,
  nome: incorporadoras.nome,
  criadaEm: incorporadoras.criadaEm,
};

export type Incorporadora = {
  id: string;
  nome: string;
  criadaEm: Date;
};

// `id` vindo do formulário torna a criação idempotente. Devolve null se o id
// já pertence a outra imobiliária.
export async function criarIncorporadora(
  session: Session,
  input: { id?: string; nome: string },
): Promise<Incorporadora | null> {
  const { imobiliariaId } = requireCorretor(session);
  const [created] = await db
    .insert(incorporadoras)
    .values({
      id: input.id,
      imobiliariaId,
      nome: input.nome,
      criadaEm: new Date(),
    })
    .onConflictDoNothing({ target: incorporadoras.id })
    .returning(columns);
  if (created) return created;
  return input.id ? buscarIncorporadora(session, input.id) : null;
}

export async function buscarIncorporadora(
  session: Session,
  id: string,
): Promise<Incorporadora | null> {
  const { imobiliariaId } = requireCorretor(session);
  if (!z.uuid().safeParse(id).success) return null;
  const [found] = await db
    .select(columns)
    .from(incorporadoras)
    .where(
      and(
        eq(incorporadoras.id, id),
        eq(incorporadoras.imobiliariaId, imobiliariaId),
      ),
    );
  return found ?? null;
}

export async function listarIncorporadoras(
  session: Session,
): Promise<Incorporadora[]> {
  const { imobiliariaId } = requireCorretor(session);
  return db
    .select(columns)
    .from(incorporadoras)
    .where(eq(incorporadoras.imobiliariaId, imobiliariaId))
    .orderBy(asc(incorporadoras.nome));
}

export async function editarIncorporadora(
  session: Session,
  id: string,
  input: { nome: string },
): Promise<Incorporadora | null> {
  const { imobiliariaId } = requireCorretor(session);
  if (!z.uuid().safeParse(id).success) return null;
  const [edited] = await db
    .update(incorporadoras)
    .set({ nome: input.nome })
    .where(
      and(
        eq(incorporadoras.id, id),
        eq(incorporadoras.imobiliariaId, imobiliariaId),
      ),
    )
    .returning(columns);
  return edited ?? null;
}
