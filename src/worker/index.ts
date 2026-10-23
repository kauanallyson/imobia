import { retomarAssistentesPausados } from "@/data/conversas";
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

// Ticket 10: retomada do assistente após 24h sem mensagem do corretor.
// (Ticket 13 traz o agendador com registro de jobs; até lá, chamada direta.)
async function retomarAssistentes() {
  try {
    const retomadas = await retomarAssistentesPausados();
    if (retomadas > 0) {
      console.log(`[worker] assistente retomado em ${retomadas} conversa(s)`);
    }
  } catch (error) {
    console.error("[worker] falha ao retomar assistentes pausados", error);
  }
}

function tick() {
  heartbeat();
  void retomarAssistentes();
}

tick();
const timer = setInterval(tick, INTERVALO_MS);

for (const sinal of ["SIGINT", "SIGTERM"] as const) {
  process.on(sinal, () => {
    clearInterval(timer);
    console.log(`[worker] ${sinal} recebido, encerrando`);
    process.exit(0);
  });
}
