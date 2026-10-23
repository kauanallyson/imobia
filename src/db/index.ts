import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgQueryResultHKT } from "drizzle-orm/node-postgres/session";
import type { PgAsyncDatabase } from "drizzle-orm/pg-core/async/db";

// Aceita tanto a conexão quanto uma transação (usada para isolar testes).
export type Db = PgAsyncDatabase<NodePgQueryResultHKT>;

export function createDb(url: string) {
  return drizzle(url);
}

export const db = createDb(process.env.DATABASE_URL!);
