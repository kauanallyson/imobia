import { describe, expect, test } from "bun:test";
import type { Ator } from "@/domain";
import { ForbiddenError } from "@/domain";
import { withRollback } from "@/test/database";
import { createTestDomain } from "@/test/domain";

const administrador: Ator = { tipo: "administrador" };

const corretorDa = (imobiliariaId: string): Ator => ({
  tipo: "corretor",
  corretorId: crypto.randomUUID(),
  imobiliariaId,
});

describe("imobiliárias", () => {
  test("o administrador cria uma imobiliária e a lê pelo id", () =>
    withRollback(async (db) => {
      const { domain, clock } = createTestDomain(db);
      clock.set(new Date("2026-03-10T09:30:00-03:00"));

      const criada = await domain.criarImobiliaria(administrador, {
        nome: "Fiel Imóveis",
      });
      const lida = await domain.buscarImobiliaria(administrador, criada.id);

      expect(lida).toEqual({
        id: criada.id,
        nome: "Fiel Imóveis",
        criadaEm: new Date("2026-03-10T09:30:00-03:00"),
      });
    }));

  test("um corretor não pode criar imobiliária", () =>
    withRollback(async (db) => {
      const { domain } = createTestDomain(db);
      const existente = await domain.criarImobiliaria(administrador, {
        nome: "Fiel Imóveis",
      });

      await expect(
        domain.criarImobiliaria(corretorDa(existente.id), { nome: "Outra" }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    }));

  test("um corretor lê a própria imobiliária", () =>
    withRollback(async (db) => {
      const { domain } = createTestDomain(db);
      const propria = await domain.criarImobiliaria(administrador, {
        nome: "Fiel Imóveis",
      });

      const lida = await domain.buscarImobiliaria(
        corretorDa(propria.id),
        propria.id,
      );

      expect(lida?.nome).toBe("Fiel Imóveis");
    }));

  test("um corretor não vê a imobiliária de outra", () =>
    withRollback(async (db) => {
      const { domain } = createTestDomain(db);
      const propria = await domain.criarImobiliaria(administrador, {
        nome: "Fiel Imóveis",
      });
      const outra = await domain.criarImobiliaria(administrador, {
        nome: "Concorrente",
      });

      const lida = await domain.buscarImobiliaria(
        corretorDa(propria.id),
        outra.id,
      );

      expect(lida).toBeNull();
    }));

  test("buscar uma imobiliária inexistente retorna null", () =>
    withRollback(async (db) => {
      const { domain } = createTestDomain(db);

      const lida = await domain.buscarImobiliaria(
        administrador,
        "00000000-0000-0000-0000-000000000000",
      );

      expect(lida).toBeNull();
    }));
});
