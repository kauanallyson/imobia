import { enviarAvisosPendentes } from "@/data/pendencias";
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

// Ticket 11: avisos de pendência que esperavam a janela de 8h–20h.
async function tick() {
  heartbeat();
  try {
    const enviados = await enviarAvisosPendentes();
    if (enviados > 0) console.log(`[worker] ${enviados} aviso(s) enviado(s)`);
  } catch (error) {
    console.error("[worker] enviarAvisosPendentes falhou", error);
  }
}

void tick();
const timer = setInterval(() => void tick(), INTERVALO_MS);

for (const sinal of ["SIGINT", "SIGTERM"] as const) {
  process.on(sinal, () => {
    clearInterval(timer);
    console.log(`[worker] ${sinal} recebido, encerrando`);
    process.exit(0);
  });
}
