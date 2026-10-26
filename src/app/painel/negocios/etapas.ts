import type { Etapa } from "@/lib/db/schema";
import { FUSO } from "@/lib/fuso";

// Rótulos das etapas fixas (GLOSSARY.md → Etapa) para a interface.
export const rotuloDaEtapa: Record<Etapa, string> = {
  novo: "Novo",
  em_atendimento: "Em atendimento",
  visita_agendada: "Visita agendada",
  coletando_dados: "Coletando dados",
  proposta_em_revisao: "Proposta em revisão",
  aguardando_assinatura: "Aguardando assinatura",
  aguardando_pagamento: "Aguardando pagamento",
  ganho: "Ganho",
  perdido: "Perdido",
};

export function formatarTelefone(telefone: string) {
  const m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(telefone);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : telefone;
}

export const formatoDataHora = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: FUSO,
});
