// Horário de Brasília sem depender do fuso do processo (spec: regras de
// horário em America/Sao_Paulo). Só Intl, sem biblioteca.

export const FUSO = "America/Sao_Paulo";

const formato = new Intl.DateTimeFormat("en-US", {
  timeZone: FUSO,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  weekday: "short",
});

const diasDaSemana = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type PartesLocais = {
  ano: number;
  mes: number; // 1-12
  dia: number;
  hora: number;
  minuto: number;
  diaDaSemana: number; // 0 = domingo
  // "YYYY-MM-DD"
  data: string;
  // "HH:MM"
  horario: string;
};

export function partesEmBrasilia(instante: Date): PartesLocais {
  const partes = Object.fromEntries(
    formato.formatToParts(instante).map((p) => [p.type, p.value]),
  );
  const ano = Number(partes.year);
  const mes = Number(partes.month);
  const dia = Number(partes.day);
  const hora = Number(partes.hour);
  const minuto = Number(partes.minute);
  return {
    ano,
    mes,
    dia,
    hora,
    minuto,
    diaDaSemana: diasDaSemana.indexOf(partes.weekday ?? ""),
    data: `${partes.year}-${partes.month}-${partes.day}`,
    horario: `${partes.hour}:${partes.minute}`,
  };
}

// O instante que corresponde a `data` (YYYY-MM-DD) às `horario` (HH:MM) em
// Brasília. Chuta UTC e corrige pelo deslocamento observado (vale com ou
// sem horário de verão).
export function instanteEmBrasilia(data: string, horario: string): Date {
  const [ano, mes, dia] = data.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const [hora, minuto] = horario.split(":").map(Number) as [number, number];
  const alvo = Date.UTC(ano, mes - 1, dia, hora, minuto);
  let instante = new Date(alvo);
  for (let i = 0; i < 2; i++) {
    const p = partesEmBrasilia(instante);
    const visto = Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto);
    if (visto === alvo) break;
    instante = new Date(instante.getTime() + (alvo - visto));
  }
  return instante;
}

// A data civil (YYYY-MM-DD) `dias` dias depois de `data`.
export function somarDias(data: string, dias: number): string {
  const [ano, mes, dia] = data.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  return new Date(Date.UTC(ano, mes - 1, dia + dias))
    .toISOString()
    .slice(0, 10);
}

export const formatoDataHoraBrasilia = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO,
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});
