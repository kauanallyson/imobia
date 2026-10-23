import { TransactionRollbackError } from "drizzle-orm/errors";
import { createDb, type Db } from "@/db";

const CONTAINER = "crm-postgres-test";
const IMAGE = "docker.io/pgvector/pgvector:pg17";
const PORT = 5433;

// Definir TEST_DATABASE_URL usa um Postgres externo e pula o Podman.
export const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  `postgresql://postgres:postgres@localhost:${PORT}/crm_test`;

export const testDb = createDb(testDatabaseUrl);

async function podman(...args: string[]) {
  const proc = Bun.spawn(["podman", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stderr).text(),
  ]);
  return { exitCode, stderr };
}

export async function ensureContainer() {
  if (process.env.TEST_DATABASE_URL) return;

  if ((await podman("container", "exists", CONTAINER)).exitCode !== 0) {
    // tmpfs: o banco de teste é descartável e rápido.
    const run = await podman(
      "run",
      "--detach",
      "--name",
      CONTAINER,
      "--env",
      "POSTGRES_PASSWORD=postgres",
      "--env",
      "POSTGRES_DB=crm_test",
      "--publish",
      `${PORT}:5432`,
      "--tmpfs",
      "/var/lib/postgresql/data",
      IMAGE,
    );
    if (run.exitCode !== 0) {
      throw new Error(`Falha ao criar ${CONTAINER}: ${run.stderr}`);
    }
  } else {
    const start = await podman("start", CONTAINER);
    if (start.exitCode !== 0) {
      throw new Error(`Falha ao iniciar ${CONTAINER}: ${start.stderr}`);
    }
  }
}

export async function waitForDatabase(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      await testDb.execute("select 1");
      return;
    } catch (error) {
      if (Date.now() > deadline) throw error;
      await Bun.sleep(250);
    }
  }
}

// Roda o corpo do teste numa transação que é sempre revertida,
// para que nenhum teste veja dados de outro.
export async function withRollback(fn: (db: Db) => Promise<void>) {
  try {
    await testDb.transaction(async (tx) => {
      await fn(tx);
      tx.rollback();
    });
  } catch (error) {
    if (!(error instanceof TransactionRollbackError)) throw error;
  }
}
