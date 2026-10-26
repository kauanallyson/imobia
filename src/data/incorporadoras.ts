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

// ---- ticket 18: instruções de pagamento da entrada --------------------------

// Texto livre e reutilizável (conta, Pix, boleto...) que o assistente envia
// ao cliente quando o corretor confirma a assinatura. Vazio limpa. Fora do
// escopo → null.
export async function definirInstrucoesDePagamento(
  session: Session,
  id: string,
  texto: string,
): Promise<{ instrucoesDePagamento: string | null } | null> {
  const { imobiliariaId } = requireCorretor(session);
  if (!z.uuid().safeParse(id).success) return null;
  const [updated] = await db
    .update(incorporadoras)
    .set({ instrucoesDePagamento: texto.trim() || null })
    .where(
      and(
        eq(incorporadoras.id, id),
        eq(incorporadoras.imobiliariaId, imobiliariaId),
      ),
    )
    .returning({ instrucoesDePagamento: incorporadoras.instrucoesDePagamento });
  return updated ?? null;
}

export async function buscarInstrucoesDePagamento(
  session: Session,
  id: string,
): Promise<string | null> {
  const { imobiliariaId } = requireCorretor(session);
  if (!z.uuid().safeParse(id).success) return null;
  const [found] = await db
    .select({ instrucoesDePagamento: incorporadoras.instrucoesDePagamento })
    .from(incorporadoras)
    .where(
      and(
        eq(incorporadoras.id, id),
        eq(incorporadoras.imobiliariaId, imobiliariaId),
      ),
    );
  return found?.instrucoesDePagamento ?? null;
}
