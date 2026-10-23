import { drizzle } from "drizzle-orm/node-postgres";
import { env } from "@/lib/env";

// Em dev, reaproveita o pool entre hot reloads.
const globalForDb = globalThis as { db?: ReturnType<typeof drizzle> };
globalForDb.db ??= drizzle(env.DATABASE_URL);

export const db = globalForDb.db;
