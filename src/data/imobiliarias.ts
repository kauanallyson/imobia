import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { imobiliarias } from "@/lib/db/schema";
import { requireAdministrador, type Session } from "./session";

const columns = {
  id: imobiliarias.id,
  nome: imobiliarias.nome,
  criadaEm: imobiliarias.criadaEm,
};

export async function criarImobiliaria(
  session: Session,
  input: { nome: string },
) {
  requireAdministrador(session);
  const [imobiliaria] = await db
    .insert(imobiliarias)
    .values({ nome: input.nome, criadaEm: new Date() })
    .returning(columns);
  return imobiliaria;
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
