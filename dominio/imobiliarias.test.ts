import { describe, expect, test } from "bun:test";
import { withRollback } from "@/test/database";
import { criarDominioDeTeste } from "@/test/dominio";

describe("imobiliárias", () => {
  test("uma imobiliária criada pode ser lida pelo seu id", () =>
    withRollback(async (db) => {
      const { dominio } = criarDominioDeTeste(db);

      const criada = await dominio.criarImobiliaria({ nome: "Fiel Imóveis" });
      const lida = await dominio.buscarImobiliaria(criada.id);

      expect(lida).toEqual({
        id: criada.id,
        nome: "Fiel Imóveis",
        criadaEm: expect.any(Date),
      });
    }));

  test("buscar uma imobiliária inexistente retorna null", () =>
    withRollback(async (db) => {
      const { dominio } = criarDominioDeTeste(db);

      const lida = await dominio.buscarImobiliaria(
        "00000000-0000-0000-0000-000000000000",
      );

      expect(lida).toBeNull();
    }));
});
