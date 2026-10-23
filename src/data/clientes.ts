import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { clientes } from "@/lib/db/schema";
import { ForbiddenError, type Session } from "./session";

export const clienteColumns = {
  id: clientes.id,
  nome: clientes.nome,
  telefone: clientes.telefone,
  email: clientes.email,
  criadoEm: clientes.criadoEm,
};

export function requireCorretor(session: Session) {
  if (session.role !== "corretor") {
    throw new ForbiddenError("Somente um corretor acessa a própria carteira");
  }
  return session;
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
