import "server-only";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { accounts, users } from "@/lib/db/schema";

export const userColumns = {
  id: users.id,
  nome: users.name,
  email: users.email,
  ativo: users.ativo,
};

export class DuplicateEmailError extends Error {
  override name = "DuplicateEmailError";
}

type NewUser = { id?: string; nome: string; email: string; senha: string } & (
  | { role: "administrador" }
  | { role: "corretor"; imobiliariaId: string }
);

// Não há cadastro público: todo usuário (administrador ou corretor) nasce
// aqui, com a senha na conta "credential" do Better Auth. Quem chama confere a
// permissão. `id` vindo do formulário torna a criação idempotente, inclusive
// com envios simultâneos: o insert não faz nada no conflito e devolve o
// usuário já criado com esse id.
export async function createUser(input: NewUser) {
  const ctx = await auth.$context;
  const password = await ctx.password.hash(input.senha);
  const now = new Date();
  const imobiliariaId = input.role === "corretor" ? input.imobiliariaId : null;

  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(users)
      .values({
        id: input.id,
        name: input.nome,
        email: input.email.toLowerCase(),
        role: input.role,
        imobiliariaId,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .returning(userColumns);

    if (created) {
      await tx.insert(accounts).values({
        accountId: created.id,
        providerId: "credential",
        userId: created.id,
        password,
        createdAt: now,
        updatedAt: now,
      });
      return created;
    }

    // Conflito: ou é o reenvio do mesmo formulário, ou o e-mail já existe.
    const [existing] = input.id
      ? await tx
          .select(userColumns)
          .from(users)
          .where(and(eq(users.id, input.id), eq(users.role, input.role)))
      : [];
    if (existing) return existing;
    throw new DuplicateEmailError("E-mail já cadastrado");
  });
}
