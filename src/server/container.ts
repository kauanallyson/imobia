import "server-only";
import { systemClock } from "@/adapters/clock/system";
import { createDb } from "@/db";
import { createRepositories } from "@/db/repositories";
import { createDomain, type Domain } from "@/domain";
import { env } from "./env";

// Placeholder para portas cujo adaptador real chega em tickets futuros:
// qualquer chamada falha com uma mensagem clara, em vez de silenciosamente.
function notConfigured<T extends object>(port: string): T {
  return new Proxy({} as T, {
    get(_, method) {
      if (method === "then") return undefined;
      return () => {
        throw new Error(`${port}.${String(method)}: adaptador não configurado`);
      };
    },
  });
}

function buildDomain(): Domain {
  const db = createDb(env.DATABASE_URL);
  return createDomain({
    ...createRepositories(db),
    whatsappConnection: notConfigured("WhatsAppConnection"),
    whatsappMessenger: notConfigured("WhatsAppMessenger"),
    llm: notConfigured("LLM"),
    calendar: notConfigured("Calendar"),
    storage: notConfigured("Storage"),
    clock: systemClock,
  });
}

// Uma instância por processo; em dev, sobrevive ao hot reload para não
// abrir um pool de conexões novo a cada edição.
const globalForDomain = globalThis as { domain?: Domain };

export function getDomain(): Domain {
  globalForDomain.domain ??= buildDomain();
  return globalForDomain.domain;
}
