import { eq } from "drizzle-orm";
import { imobiliarias } from "@/db/schema";
import type { DependenciasDoDominio } from ".";

export type Imobiliaria = typeof imobiliarias.$inferSelect;

export const criarImobiliaria =
  ({ db }: DependenciasDoDominio) =>
  async (dados: { nome: string }): Promise<Imobiliaria> => {
    const [imobiliaria] = await db
      .insert(imobiliarias)
      .values({ nome: dados.nome })
      .returning();
    return imobiliaria;
  };

export const buscarImobiliaria =
  ({ db }: DependenciasDoDominio) =>
  async (id: string): Promise<Imobiliaria | null> => {
    const [imobiliaria] = await db
      .select()
      .from(imobiliarias)
      .where(eq(imobiliarias.id, id));
    return imobiliaria ?? null;
  };
