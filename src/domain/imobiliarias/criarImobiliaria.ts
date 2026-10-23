import type { DomainDeps } from "..";
import { type Ator, exigirAdministrador } from "../ator";
import type { Imobiliaria } from "./imobiliaria";

export const criarImobiliaria =
  ({ imobiliarias, clock }: Pick<DomainDeps, "imobiliarias" | "clock">) =>
  async (ator: Ator, input: { nome: string }): Promise<Imobiliaria> => {
    exigirAdministrador(ator);
    return imobiliarias.inserir({ nome: input.nome, criadaEm: clock.now() });
  };
