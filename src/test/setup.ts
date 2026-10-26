import { afterAll, beforeEach, mock, setSystemTime } from "bun:test";
import { ensureContainer, testDatabaseUrl } from "./database";

// Antes de qualquer import da aplicação: o db de @/lib/db lê esta URL.
process.env.DATABASE_URL = testDatabaseUrl;
process.env.BETTER_AUTH_SECRET =
  "segredo-de-teste-com-pelo-menos-32-caracteres";
process.env.BETTER_AUTH_URL = "http://localhost:3000";
process.env.APP_URL = "http://localhost:3000";
process.env.EVOLUTION_API_URL = "http://evolution.test:8080";
process.env.EVOLUTION_API_KEY = "chave-de-teste";
process.env.EVOLUTION_WEBHOOK_SECRET = "segredo-de-teste-com-32-caracteres";
process.env.EVOLUTION_SYSTEM_INSTANCE = "sistema-de-teste";
process.env.OPENAI_API_KEY = "sk-teste";
process.env.OPENAI_TRANSCRIBE_MODEL = "gpt-transcribe";
process.env.R2_ACCOUNT_ID = "conta-de-teste";
process.env.R2_ACCESS_KEY_ID = "chave-de-teste";
process.env.R2_SECRET_ACCESS_KEY = "segredo-de-teste";
process.env.R2_BUCKET = "loteai-test";
if (!new URL(testDatabaseUrl).pathname.endsWith("_test")) {
  throw new Error(
    "O banco de teste precisa terminar em _test (é limpo a cada teste)",
  );
}

// `server-only` só existe no ambiente React Server; fora dele, lança erro.
mock.module("server-only", () => ({}));

await ensureContainer();

const { db } = await import("@/lib/db");
const { migrate } = await import("drizzle-orm/node-postgres/migrator");

const deadline = Date.now() + 30_000;
for (;;) {
  try {
    await db.execute("select 1");
    break;
  } catch (error) {
    if (Date.now() > deadline) throw error;
    await Bun.sleep(250);
  }
}
await migrate(db, { migrationsFolder: "./drizzle" });

beforeEach(async () => {
  setSystemTime();
  await db.execute(`
    do $$ declare t text; begin
      for t in select tablename from pg_tables where schemaname = 'public' loop
        execute format('truncate table %I cascade', t);
      end loop;
    end $$;
  `);
});

afterAll(async () => {
  await db.$client.end();
});
