import { jobDeLembretesDeEtapasFinais } from "@/data/assinatura-e-pagamento";
import { jobDeLembretesDeColeta } from "@/data/coleta-de-dados";
import { jobDeFollowUps } from "@/data/follow-ups";
import { jobDeExpiracaoDeReservas } from "@/data/propostas";
import { jobDoGoogleCalendar } from "@/data/sincronizar-google-calendar";
import { jobDeLembretesDeVisita } from "@/data/visitas";

// Registro dos jobs agendados. Cada job é uma função de src/data sem
// argumentos, idempotente (chave natural no banco): o scheduler a chama a
// cada minuto. Tickets seguintes acrescentam uma linha (follow-ups,
// expiração de reservas, retomada do assistente, Google Calendar).
export type Job = { nome: string; executar: () => Promise<unknown> };

export const jobs: Job[] = [
  jobDeLembretesDeVisita, // ticket 13
  jobDeFollowUps, // ticket 15
  jobDoGoogleCalendar, // ticket 14
  jobDeLembretesDeColeta, // ticket 16
  jobDeExpiracaoDeReservas, // ticket 17
  jobDeLembretesDeEtapasFinais, // ticket 18
];
