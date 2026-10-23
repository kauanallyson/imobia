import { AgendaFalsa } from "@/adaptadores/agenda";
import { ArmazenamentoFalso } from "@/adaptadores/armazenamento";
import { LLMFalso } from "@/adaptadores/llm";
import { RelogioFalso } from "@/adaptadores/relogio";
import { WhatsAppFalso } from "@/adaptadores/whatsapp";
import type { Db } from "@/db";
import { criarDominio } from "@/dominio";

// Domínio ligado a todos os adaptadores falsos; os falsos são devolvidos
// para que o teste roteirize entradas e verifique efeitos.
export function criarDominioDeTeste(db: Db) {
  const falsos = {
    whatsapp: new WhatsAppFalso(),
    llm: new LLMFalso(),
    agenda: new AgendaFalsa(),
    armazenamento: new ArmazenamentoFalso(),
    relogio: new RelogioFalso(),
  };
  return { dominio: criarDominio({ db, ...falsos }), ...falsos };
}
