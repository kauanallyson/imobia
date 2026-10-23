import type { DomainDeps } from "..";
import { canAccessImobiliaria, type Session } from "../session";
import type { Imobiliaria } from "./imobiliaria";

// Fora do escopo da sessão é o mesmo que não existir: não revela a
// existência de dados de outra imobiliária.
export const buscarImobiliaria =
  ({ imobiliarias }: Pick<DomainDeps, "imobiliarias">) =>
  async (session: Session, id: string): Promise<Imobiliaria | null> => {
    if (!canAccessImobiliaria(session, id)) return null;
    return imobiliarias.buscarPorId(id);
  };
