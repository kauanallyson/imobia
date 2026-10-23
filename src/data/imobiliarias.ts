import "server-only";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { imobiliarias } from "@/lib/db/schema";
import { requireAdministrador, type Session } from "./session";

const columns = {
  id: imobiliarias.id,
  nome: imobiliarias.nome,
  criadaEm: imobiliarias.criadaEm,
};

// `id` vindo do formulário torna a criação idempotente: reenviar o mesmo
// formulário devolve a imobiliária já criada.
export async function criarImobiliaria(
  session: Session,
  input: { id?: string; nome: string },
) {
  requireAdministrador(session);
  const [created] = await db
    .insert(imobiliarias)
    .values({ id: input.id, nome: input.nome, criadaEm: new Date() })
    .onConflictDoNothing({ target: imobiliarias.id })
    .returning(columns);
  if (created || !input.id) return created;

  const [existing] = await db
    .select(columns)
    .from(imobiliarias)
    .where(eq(imobiliarias.id, input.id));
  return existing;
}

// Fora do escopo da sessão é o mesmo que não existir: não revela dados de
// outra imobiliária.
export async function buscarImobiliaria(session: Session, id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  if (session.role === "corretor" && session.imobiliariaId !== id) return null;

  const [imobiliaria] = await db
    .select(columns)
    .from(imobiliarias)
    .where(eq(imobiliarias.id, id));
  return imobiliaria ?? null;
}

export async function listarImobiliarias(session: Session) {
  requireAdministrador(session);
  return db.select(columns).from(imobiliarias).orderBy(asc(imobiliarias.nome));
}
