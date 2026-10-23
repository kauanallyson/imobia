import type { DomainDeps } from "..";
import { requireAdministrador, type Session } from "../session";
import type { Imobiliaria } from "./imobiliaria";

export const criarImobiliaria =
  ({ imobiliarias, clock }: Pick<DomainDeps, "imobiliarias" | "clock">) =>
  async (session: Session, input: { nome: string }): Promise<Imobiliaria> => {
    requireAdministrador(session);
    return imobiliarias.inserir({ nome: input.nome, criadaEm: clock.now() });
  };
