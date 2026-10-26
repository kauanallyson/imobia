import { beforeEach, mock } from "bun:test";
import * as calendar from "./calendar";
import * as documentos from "./documentos";
import * as llm from "./llm";
import * as storage from "./storage";
import * as whatsapp from "./whatsapp";

// Troca as integrações pelos falsos antes de qualquer módulo da aplicação
// ser avaliado: nenhum teste fala com a Evolution.
mock.module("@/lib/whatsapp", () => whatsapp);
mock.module("@/lib/llm", () => llm);
mock.module("@/lib/storage", () => storage);
mock.module("@/lib/calendar", () => calendar);
mock.module("@/lib/documentos", () => documentos);

export function limparFakes() {
  whatsapp.limpar();
  llm.limpar();
  storage.limpar();
  calendar.limpar();
  documentos.limpar();
}

beforeEach(() => {
  limparFakes();
});
