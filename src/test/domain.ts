import { CalendarFake } from "@/adapters/calendar";
import { ClockFake } from "@/adapters/clock";
import { LLMFake } from "@/adapters/llm";
import { StorageFake } from "@/adapters/storage";
import { WhatsAppFake } from "@/adapters/whatsapp";
import type { Db } from "@/db";
import { createDomain } from "@/domain";

// Domínio ligado a todos os adaptadores falsos; os falsos são devolvidos
// para que o teste roteirize entradas e verifique efeitos.
export function createTestDomain(db: Db) {
  const fakes = {
    whatsapp: new WhatsAppFake(),
    llm: new LLMFake(),
    calendar: new CalendarFake(),
    storage: new StorageFake(),
    clock: new ClockFake(),
  };
  return { domain: createDomain({ db, ...fakes }), ...fakes };
}
