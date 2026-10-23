import type { Agenda } from "@/adaptadores/agenda";
import type { Armazenamento } from "@/adaptadores/armazenamento";
import type { LLM } from "@/adaptadores/llm";
import type { Relogio } from "@/adaptadores/relogio";
import type { WhatsApp } from "@/adaptadores/whatsapp";
import type { Db } from "@/db";
import { buscarImobiliaria, criarImobiliaria } from "./imobiliarias";

export type DependenciasDoDominio = {
  db: Db;
  whatsapp: WhatsApp;
  llm: LLM;
  agenda: Agenda;
  armazenamento: Armazenamento;
  relogio: Relogio;
};

// Única porta de entrada para regras de negócio: páginas, server actions,
// worker e ferramentas do assistente chamam o domínio, nunca o banco direto.
export function criarDominio(deps: DependenciasDoDominio) {
  return {
    criarImobiliaria: criarImobiliaria(deps),
    buscarImobiliaria: buscarImobiliaria(deps),
  };
}

export type Dominio = ReturnType<typeof criarDominio>;
export type { Imobiliaria } from "./imobiliarias";
