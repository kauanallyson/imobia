import { CalendarFake } from "@/adapters/calendar/fake";
import { ClockFake } from "@/adapters/clock/fake";
import { LLMFake } from "@/adapters/llm/fake";
import { StorageFake } from "@/adapters/storage/fake";
import { WhatsAppFake } from "@/adapters/whatsapp/fake";
import type { Db } from "@/db";
import { createRepositories } from "@/db/repositories";
import { createDomain } from "@/domain";

// Domínio com os repositórios Drizzle reais (sobre o `db` do teste) e os
// adaptadores externos falsos, devolvidos para o teste roteirizar entradas
// e verificar efeitos.
export function createTestDomain(db: Db) {
  const whatsapp = new WhatsAppFake();
  const fakes = {
    whatsapp,
    llm: new LLMFake(),
    calendar: new CalendarFake(),
    storage: new StorageFake(),
    clock: new ClockFake(),
  };
  const domain = createDomain({
    ...createRepositories(db),
    ...fakes,
    whatsappConnection: whatsapp,
    whatsappMessenger: whatsapp,
  });
  return { domain, ...fakes };
}
