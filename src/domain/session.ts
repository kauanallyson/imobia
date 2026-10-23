import { ForbiddenError } from "./errors";

// Quem está chamando o caso de uso. Todo caso de uso chamado pela interface
// recebe a sessão explicitamente e aplica o escopo a partir dela (ADR-0001).
export type Session =
  | { role: "administrador" }
  | { role: "corretor"; corretorId: string; imobiliariaId: string };

export function requireAdministrador(session: Session) {
  if (session.role !== "administrador") {
    throw new ForbiddenError("Somente o administrador pode fazer isso");
  }
}

export function canAccessImobiliaria(session: Session, imobiliariaId: string) {
  return (
    session.role === "administrador" || session.imobiliariaId === imobiliariaId
  );
}
