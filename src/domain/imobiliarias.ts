import { eq } from "drizzle-orm";
import { imobiliarias } from "@/db/schema";
import type { DomainDeps } from ".";

export type Imobiliaria = typeof imobiliarias.$inferSelect;

export const criarImobiliaria =
  ({ db }: DomainDeps) =>
  async (input: { nome: string }): Promise<Imobiliaria> => {
    const [imobiliaria] = await db
      .insert(imobiliarias)
      .values({ nome: input.nome })
      .returning();
    return imobiliaria;
  };

export const buscarImobiliaria =
  ({ db }: DomainDeps) =>
  async (id: string): Promise<Imobiliaria | null> => {
    const [imobiliaria] = await db
      .select()
      .from(imobiliarias)
      .where(eq(imobiliarias.id, id));
    return imobiliaria ?? null;
  };
