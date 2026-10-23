import { describe, expect, setSystemTime, test } from "bun:test";
import {
  buscarImobiliaria,
  criarImobiliaria,
  listarImobiliarias,
} from "./imobiliarias";
import { ForbiddenError, type Session } from "./session";

const administrador: Session = { role: "administrador" };

const corretorOf = (imobiliariaId: string): Session => ({
  role: "corretor",
  corretorId: crypto.randomUUID(),
  imobiliariaId,
});

describe("imobiliárias", () => {
  test("o administrador cria uma imobiliária e a lê pelo id", async () => {
    setSystemTime(new Date("2026-03-10T09:30:00-03:00"));

    const created = await criarImobiliaria(administrador, {
      nome: "Fiel Imóveis",
    });
    const found = await buscarImobiliaria(administrador, created.id);

    expect(found).toEqual({
      id: created.id,
      nome: "Fiel Imóveis",
      criadaEm: new Date("2026-03-10T09:30:00-03:00"),
    });
  });

  test("um corretor não pode criar imobiliária", async () => {
    const existing = await criarImobiliaria(administrador, {
      nome: "Fiel Imóveis",
    });

    await expect(
      criarImobiliaria(corretorOf(existing.id), { nome: "Outra" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  test("um corretor lê a própria imobiliária", async () => {
    const own = await criarImobiliaria(administrador, {
      nome: "Fiel Imóveis",
    });

    const found = await buscarImobiliaria(corretorOf(own.id), own.id);

    expect(found?.nome).toBe("Fiel Imóveis");
  });

  test("um corretor não vê a imobiliária de outra", async () => {
    const own = await criarImobiliaria(administrador, {
      nome: "Fiel Imóveis",
    });
    const other = await criarImobiliaria(administrador, {
      nome: "Concorrente",
    });

    const found = await buscarImobiliaria(corretorOf(own.id), other.id);

    expect(found).toBeNull();
  });

  test("buscar uma imobiliária inexistente retorna null", async () => {
    const found = await buscarImobiliaria(
      administrador,
      "00000000-0000-0000-0000-000000000000",
    );

    expect(found).toBeNull();
  });

  test("buscar com um id que não é UUID retorna null", async () => {
    const found = await buscarImobiliaria(administrador, "nao-e-um-uuid");

    expect(found).toBeNull();
  });

  test("o administrador lista as imobiliárias por nome", async () => {
    const fiel = await criarImobiliaria(administrador, {
      nome: "Fiel Imóveis",
    });
    const casa = await criarImobiliaria(administrador, { nome: "Casa Nova" });

    const found = await listarImobiliarias(administrador);

    expect(found.map((i) => i.id)).toEqual([casa.id, fiel.id]);
  });

  test("um corretor não lista imobiliárias", async () => {
    const own = await criarImobiliaria(administrador, { nome: "Fiel Imóveis" });

    await expect(listarImobiliarias(corretorOf(own.id))).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  test("repetir a criação com o mesmo id não duplica a imobiliária", async () => {
    const id = crypto.randomUUID();

    const first = await criarImobiliaria(administrador, {
      id,
      nome: "Fiel Imóveis",
    });
    const again = await criarImobiliaria(administrador, {
      id,
      nome: "Fiel Imóveis",
    });

    expect(again).toEqual(first);
    expect(await listarImobiliarias(administrador)).toHaveLength(1);
  });
});
