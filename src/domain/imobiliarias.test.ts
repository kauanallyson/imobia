import { describe, expect, test } from "bun:test";
import { withRollback } from "@/test/database";
import { createTestDomain } from "@/test/domain";

describe("imobiliárias", () => {
  test("uma imobiliária criada pode ser lida pelo seu id", () =>
    withRollback(async (db) => {
      const { domain } = createTestDomain(db);

      const criada = await domain.criarImobiliaria({ nome: "Fiel Imóveis" });
      const lida = await domain.buscarImobiliaria(criada.id);

      expect(lida).toEqual({
        id: criada.id,
        nome: "Fiel Imóveis",
        criadaEm: expect.any(Date),
      });
    }));

  test("buscar uma imobiliária inexistente retorna null", () =>
    withRollback(async (db) => {
      const { domain } = createTestDomain(db);

      const lida = await domain.buscarImobiliaria(
        "00000000-0000-0000-0000-000000000000",
      );

      expect(lida).toBeNull();
    }));
});
