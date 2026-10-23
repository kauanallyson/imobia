import type { Calendar } from "@/adapters/calendar";
import type { Clock } from "@/adapters/clock";
import type { LLM } from "@/adapters/llm";
import type { Storage } from "@/adapters/storage";
import type { WhatsApp } from "@/adapters/whatsapp";
import type { Db } from "@/db";
import { buscarImobiliaria, criarImobiliaria } from "./imobiliarias";

export type DomainDeps = {
  db: Db;
  whatsapp: WhatsApp;
  llm: LLM;
  calendar: Calendar;
  storage: Storage;
  clock: Clock;
};

// Única porta de entrada para regras de negócio: páginas, server actions,
// worker e ferramentas do assistente chamam o domínio, nunca o banco direto.
export function createDomain(deps: DomainDeps) {
  return {
    criarImobiliaria: criarImobiliaria(deps),
    buscarImobiliaria: buscarImobiliaria(deps),
  };
}

export type Domain = ReturnType<typeof createDomain>;
export type { Imobiliaria } from "./imobiliarias";
