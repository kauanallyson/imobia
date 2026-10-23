import { eq } from "drizzle-orm";
import type { Imobiliaria } from "@/domain";
import type { ImobiliariaRepository } from "@/domain/ports/repositories";
import type { Db } from "..";
import { imobiliarias } from "../schema";

const paraDominio = (linha: typeof imobiliarias.$inferSelect): Imobiliaria => ({
  id: linha.id,
  nome: linha.nome,
  criadaEm: linha.criadaEm,
});

export function createImobiliariaRepository(db: Db): ImobiliariaRepository {
  return {
    async inserir(dados) {
      const [linha] = await db.insert(imobiliarias).values(dados).returning();
      return paraDominio(linha);
    },

    async buscarPorId(id) {
      const [linha] = await db
        .select()
        .from(imobiliarias)
        .where(eq(imobiliarias.id, id));
      return linha ? paraDominio(linha) : null;
    },
  };
}
