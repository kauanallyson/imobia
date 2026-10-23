import { retomarAssistentesPausados } from "@/data/conversas";
import { enviarAvisosPendentes } from "@/data/pendencias";
import { env } from "@/lib/env";
import { type Job, jobs } from "./jobs";

// Processo de jobs agendados, separado do servidor web (spec → Worker).
// Roda com `bun --conditions=react-server` (src/data usa server-only).
// A cada minuto executa todos os jobs de ./jobs.ts, cada um isolado: a falha
// de um não impede os outros nem derruba o processo.
const INTERVALO_MS = 60_000;

async function executar(job: Job) {
  const inicio = Date.now();
  try {
    const resultado = await job.executar();
    console.log(
      `[worker] ${job.nome} ok em ${Date.now() - inicio}ms`,
      resultado ?? "",
    );
  } catch (error) {
    console.error(`[worker] ${job.nome} falhou`, error);
  }
}

const jobsDoWorker: Job[] = [
  {
    nome: "retomar-assistentes-pausados",
    executar: retomarAssistentesPausados,
  },
  { nome: "avisos-de-pendencias", executar: enviarAvisosPendentes },
  ...jobs,
];

let rodando = false;
async function ciclo() {
  if (rodando) return; // um ciclo lento não acumula com o próximo
  rodando = true;
  console.log(
    `[worker] ${new Date().toISOString()} ativo (banco: ${new URL(env.DATABASE_URL).host}, jobs: ${jobsDoWorker.map((j) => j.nome).join(", ")})`,
  );
  try {
    for (const job of jobsDoWorker) await executar(job);
  } finally {
    rodando = false;
  }
}

void ciclo();
const timer = setInterval(ciclo, INTERVALO_MS);

for (const sinal of ["SIGINT", "SIGTERM"] as const) {
  process.on(sinal, () => {
    clearInterval(timer);
    console.log(`[worker] ${sinal} recebido, encerrando`);
    process.exit(0);
  });
}
