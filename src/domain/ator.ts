import { ForbiddenError } from "./errors";

// Quem está chamando o caso de uso. Todo caso de uso chamado pela interface
// recebe o ator explicitamente e aplica o escopo a partir dele (ADR-0001).
export type Ator =
  | { tipo: "administrador" }
  | { tipo: "corretor"; corretorId: string; imobiliariaId: string };

export function exigirAdministrador(ator: Ator) {
  if (ator.tipo !== "administrador") {
    throw new ForbiddenError("Somente o administrador pode fazer isso");
  }
}

export function enxergaImobiliaria(ator: Ator, imobiliariaId: string) {
  return ator.tipo === "administrador" || ator.imobiliariaId === imobiliariaId;
}
