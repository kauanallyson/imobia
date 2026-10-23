const CONTAINER = "crm-postgres-test";
const IMAGE = "docker.io/pgvector/pgvector:pg17";
const PORT = 5433;

// Definir TEST_DATABASE_URL usa um Postgres externo e pula o Podman.
export const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  `postgresql://postgres:postgres@localhost:${PORT}/crm_test`;

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

  const exists = await podman("container", "exists", CONTAINER);
  // tmpfs: o banco de teste é descartável e rápido.
  const result =
    exists.exitCode === 0
      ? await podman("start", CONTAINER)
      : await podman(
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
  if (result.exitCode !== 0) {
    throw new Error(`Falha ao subir ${CONTAINER}: ${result.stderr}`);
  }
}
