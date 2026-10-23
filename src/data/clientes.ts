import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { clientes } from "@/lib/db/schema";
import { ForbiddenError, type Session } from "./session";

export const clienteColumns = {
  id: clientes.id,
  nome: clientes.nome,
  telefone: clientes.telefone,
  email: clientes.email,
  cpf: clientes.cpf,
  criadoEm: clientes.criadoEm,
};

export class TelefoneDuplicadoError extends Error {
  override name = "TelefoneDuplicadoError";
}

export function requireCorretor(session: Session) {
  if (session.role !== "corretor") {
    throw new ForbiddenError("Somente um corretor acessa a própria carteira");
  }
  return session;
}

// Telefone guardado só com dígitos e DDI (ex.: 5588999990000), como a
// Evolution o entrega; número brasileiro digitado sem o 55 ganha o DDI.
export function normalizarTelefone(telefone: string) {
  const digitos = telefone.replace(/\D/g, "");
  return digitos.length === 10 || digitos.length === 11
    ? `55${digitos}`
    : digitos;
}

// Clientes pertencem ao corretor dono (spec: carteira privada).
export async function listarClientes(session: Session) {
  const { corretorId } = requireCorretor(session);
  return db
    .select(clienteColumns)
    .from(clientes)
    .where(eq(clientes.corretorId, corretorId))
    .orderBy(asc(clientes.nome));
}

export async function buscarCliente(session: Session, id: string) {
  const { corretorId } = requireCorretor(session);
  if (!z.uuid().safeParse(id).success) return null;
  const [found] = await db
    .select(clienteColumns)
    .from(clientes)
    .where(and(eq(clientes.id, id), eq(clientes.corretorId, corretorId)));
  return found ?? null;
}

// Cadastro manual (história 29). Idempotente pelo `id` do formulário; um
// segundo cliente com o mesmo telefone para o corretor é recusado.
export async function criarCliente(
  session: Session,
  input: {
    id?: string;
    nome: string;
    telefone: string;
    email?: string | null;
    cpf?: string | null;
  },
) {
  const { corretorId, imobiliariaId } = requireCorretor(session);
  const telefone = normalizarTelefone(input.telefone);
  const [created] = await db
    .insert(clientes)
    .values({
      id: input.id,
      imobiliariaId,
      corretorId,
      nome: input.nome.trim(),
      telefone,
      email: input.email || null,
      cpf: input.cpf || null,
      criadoEm: new Date(),
    })
    .onConflictDoNothing()
    .returning(clienteColumns);
  if (created) return created;

  const existing = input.id ? await buscarCliente(session, input.id) : null;
  if (existing) return existing;
  throw new TelefoneDuplicadoError(
    `Já existe um cliente com o telefone ${telefone}`,
  );
}
