// Quem está chamando. Server Actions e páginas obtêm a sessão (ticket 02) e
// a passam para a DAL; worker e assistente montam a do corretor do negócio.
export type Session =
  | { role: "administrador" }
  | { role: "corretor"; corretorId: string; imobiliariaId: string };

export class ForbiddenError extends Error {
  override name = "ForbiddenError";
}

export function requireAdministrador(session: Session) {
  if (session.role !== "administrador") {
    throw new ForbiddenError("Somente o administrador pode fazer isso");
  }
}
