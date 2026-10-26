import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/lib/auth";

// Quem está chamando. Server Actions e páginas obtêm a sessão e a passam
// para a DAL; worker e assistente montam a do corretor do negócio.
export type Session =
  | { role: "administrador" }
  | { role: "corretor"; corretorId: string; imobiliariaId: string };

export type SessaoDoCorretor = Extract<Session, { role: "corretor" }>;

// Sessão fora de um request (worker, assistente, webhook): a do corretor dono
// do negócio ou da conversa.
export function sessaoDoCorretor(
  corretorId: string,
  imobiliariaId: string,
): SessaoDoCorretor {
  return { role: "corretor", corretorId, imobiliariaId };
}

export class ForbiddenError extends Error {
  override name = "ForbiddenError";
}

export function requireAdministrador(session: Session) {
  if (session.role !== "administrador") {
    throw new ForbiddenError("Somente o administrador pode fazer isso");
  }
}

// Traduz o cookie do Better Auth na Session da DAL. Sem sessão válida, ou
// com a conta desativada, devolve null.
export async function sessionFromHeaders(
  headers: Headers,
): Promise<Session | null> {
  const result = await auth.api.getSession({ headers });
  if (!result?.user.ativo) return null;

  const { user } = result;
  if (user.role === "administrador") return { role: "administrador" };
  if (user.role === "corretor" && user.imobiliariaId) {
    return sessaoDoCorretor(user.id, user.imobiliariaId);
  }
  return null;
}

// Sessão do request atual, lida uma vez por render.
export const getSession = cache(async () =>
  sessionFromHeaders(await headers()),
);

// Página inicial de cada papel.
export function homePath(role: Session["role"]) {
  return role === "administrador" ? "/admin" : "/painel";
}

// Para páginas: sem sessão vai para o login; papel errado vai para a página
// inicial do próprio papel.
export async function verificarAdministrador() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "administrador") redirect(homePath(session.role));
  return session;
}

export async function verificarCorretor() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "corretor") redirect(homePath(session.role));
  return session;
}

// Catálogo, clientes e negócios são de corretores: o administrador não entra.
export function requireCorretor(
  session: Session,
): Extract<Session, { role: "corretor" }> {
  if (session.role !== "corretor") {
    throw new ForbiddenError("Somente um corretor pode fazer isso");
  }
  return session;
}
