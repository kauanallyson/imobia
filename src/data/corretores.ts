import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { sessions, users } from "@/lib/db/schema";
import { buscarImobiliaria } from "./imobiliarias";
import { requireAdministrador, type Session } from "./session";
import { createUser, userColumns } from "./users";

export async function criarCorretor(
  session: Session,
  input: {
    id?: string;
    imobiliariaId: string;
    nome: string;
    email: string;
    senha: string;
  },
) {
  requireAdministrador(session);
  if (!(await buscarImobiliaria(session, input.imobiliariaId))) return null;
  return createUser({ ...input, role: "corretor" });
}

export async function listarCorretores(
  session: Session,
  imobiliariaId: string,
) {
  requireAdministrador(session);
  if (!z.uuid().safeParse(imobiliariaId).success) return [];

  return db
    .select(userColumns)
    .from(users)
    .where(
      and(eq(users.role, "corretor"), eq(users.imobiliariaId, imobiliariaId)),
    )
    .orderBy(asc(users.name));
}

// Desativar também encerra as sessões abertas: o corretor sai na hora.
export async function desativarCorretor(session: Session, id: string) {
  requireAdministrador(session);
  if (!z.uuid().safeParse(id).success) return null;

  return db.transaction(async (tx) => {
    const [corretor] = await tx
      .update(users)
      .set({ ativo: false, updatedAt: new Date() })
      .where(and(eq(users.id, id), eq(users.role, "corretor")))
      .returning(userColumns);
    if (!corretor) return null;
    await tx.delete(sessions).where(eq(sessions.userId, id));
    return corretor;
  });
}
