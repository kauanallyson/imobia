import { buscarImobiliaria } from "./imobiliarias/buscarImobiliaria";
import { criarImobiliaria } from "./imobiliarias/criarImobiliaria";
import type { Calendar } from "./ports/calendar";
import type { Clock } from "./ports/clock";
import type { LLM } from "./ports/llm";
import type { Repositories } from "./ports/repositories";
import type { Storage } from "./ports/storage";
import type { WhatsAppConnection, WhatsAppMessenger } from "./ports/whatsapp";

// ADR-0005: o domínio só conhece as próprias portas. Quem monta as
// dependências reais é a raiz de composição (src/server/container.ts).
export type DomainDeps = Repositories & {
  whatsappConnection: WhatsAppConnection;
  whatsappMessenger: WhatsAppMessenger;
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
export { ForbiddenError } from "./errors";
export type { Imobiliaria } from "./imobiliarias/imobiliaria";
export type { Session } from "./session";
