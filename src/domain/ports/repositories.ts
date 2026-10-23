import type { Imobiliaria } from "../imobiliarias/imobiliaria";

// Repositórios falam a língua do domínio e devolvem tipos do domínio,
// nunca linhas do banco.

export interface ImobiliariaRepository {
  inserir(dados: Omit<Imobiliaria, "id">): Promise<Imobiliaria>;
  buscarPorId(id: string): Promise<Imobiliaria | null>;
}

export type Repositories = {
  imobiliarias: ImobiliariaRepository;
};
