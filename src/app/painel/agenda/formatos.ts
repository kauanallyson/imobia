import { FUSO } from "@/lib/fuso";

export const nomesDosDias = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];

export const formatoDeVisita = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO,
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

// "2026-11-02" → "02/11/2026" sem passar por Date (é um dia civil).
export function formatarData(data: string) {
  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}/${ano}`;
}
