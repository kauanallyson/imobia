import { beforeEach, mock } from "bun:test";
import * as storage from "./storage";
import * as whatsapp from "./whatsapp";

// Troca as integrações pelos falsos antes de qualquer módulo da aplicação
// ser avaliado: nenhum teste fala com a Evolution.
mock.module("@/lib/whatsapp", () => whatsapp);
mock.module("@/lib/storage", () => storage);

export function limparFakes() {
  whatsapp.limpar();
  storage.limpar();
}

beforeEach(() => {
  limparFakes();
});
