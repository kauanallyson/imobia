import "server-only";
import { createUser } from "./users";

// Sem Session: só o script de bootstrap (bun run admin:create) chama esta
// função, nunca a interface.
export async function criarAdministrador(input: {
  nome: string;
  email: string;
  senha: string;
}) {
  return createUser({ ...input, role: "administrador" });
}
