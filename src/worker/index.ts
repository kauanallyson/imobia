import { env } from "@/lib/env";

// Processo de jobs agendados, separado do servidor web (spec: follow-ups,
// lembretes, expiração de reservas, retomada do assistente, Google Calendar).
// Por enquanto só prova que o serviço sobe e lê o ambiente: os tickets
// seguintes registram jobs aqui, chamando as funções de `src/data`.
const INTERVALO_MS = 60_000;

function heartbeat() {
  console.log(
    `[worker] ${new Date().toISOString()} ativo (banco: ${new URL(env.DATABASE_URL).host})`,
  );
}

heartbeat();
const timer = setInterval(heartbeat, INTERVALO_MS);

for (const sinal of ["SIGINT", "SIGTERM"] as const) {
  process.on(sinal, () => {
    clearInterval(timer);
    console.log(`[worker] ${sinal} recebido, encerrando`);
    process.exit(0);
  });
}
