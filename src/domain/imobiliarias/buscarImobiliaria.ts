import type { DomainDeps } from "..";
import { type Ator, enxergaImobiliaria } from "../ator";
import type { Imobiliaria } from "./imobiliaria";

// Fora do escopo do ator é o mesmo que não existir: não revela a existência
// de dados de outra imobiliária.
export const buscarImobiliaria =
  ({ imobiliarias }: Pick<DomainDeps, "imobiliarias">) =>
  async (ator: Ator, id: string): Promise<Imobiliaria | null> => {
    if (!enxergaImobiliaria(ator, id)) return null;
    return imobiliarias.buscarPorId(id);
  };
