import { describe, expect, test } from "bun:test";
import { administrador, criarAna, criarBruno, sessaoDe } from "@/test/fixtures";
import {
  bloquearData,
  criarJanela,
  desbloquearData,
  HorarioInvalidoError,
  listarDatasBloqueadas,
  listarJanelas,
  removerJanela,
} from "./disponibilidade";
import { ForbiddenError } from "./session";

describe("disponibilidade do corretor", () => {
  test("corretor cadastra janelas semanais e as vê ordenadas por dia e início", async () => {
    const { imobiliaria, corretor } = await criarAna();
    const session = sessaoDe(corretor, imobiliaria);

    await criarJanela(session, {
      diaDaSemana: 3,
      inicio: "14:00",
      fim: "18:00",
    });
    await criarJanela(session, {
      diaDaSemana: 1,
      inicio: "09:00",
      fim: "12:00",
    });

    const janelas = await listarJanelas(session);
    expect(janelas.map((j) => [j.diaDaSemana, j.inicio, j.fim])).toEqual([
      [1, "09:00", "12:00"],
      [3, "14:00", "18:00"],
    ]);
  });

  test("repetir a criação com o mesmo id não duplica a janela", async () => {
    const { imobiliaria, corretor } = await criarAna();
    const session = sessaoDe(corretor, imobiliaria);
    const id = crypto.randomUUID();
    const input = { id, diaDaSemana: 1, inicio: "09:00", fim: "12:00" };

    const first = await criarJanela(session, input);
    const second = await criarJanela(session, input);

    expect(second).toEqual(first);
    expect(await listarJanelas(session)).toHaveLength(1);
  });

  test("janela com fim antes do início é rejeitada", async () => {
    const { imobiliaria, corretor } = await criarAna();
    const session = sessaoDe(corretor, imobiliaria);
    await expect(
      criarJanela(session, { diaDaSemana: 1, inicio: "12:00", fim: "09:00" }),
    ).rejects.toBeInstanceOf(HorarioInvalidoError);
    await expect(
      criarJanela(session, { diaDaSemana: 1, inicio: "9h", fim: "12:00" }),
    ).rejects.toBeInstanceOf(HorarioInvalidoError);
  });

  test("janelas e datas bloqueadas são do corretor: o colega da imobiliária não as vê nem remove", async () => {
    const { imobiliaria, corretor } = await criarAna();
    const ana = sessaoDe(corretor, imobiliaria);
    const bruno = sessaoDe(await criarBruno(imobiliaria), imobiliaria);

    const janela = await criarJanela(ana, {
      diaDaSemana: 1,
      inicio: "09:00",
      fim: "12:00",
    });
    const bloqueio = await bloquearData(ana, { data: "2026-11-02" });

    expect(await listarJanelas(bruno)).toEqual([]);
    expect(await listarDatasBloqueadas(bruno)).toEqual([]);
    expect(await removerJanela(bruno, janela.id)).toBeNull();
    expect(await desbloquearData(bruno, bloqueio.id)).toBeNull();
    expect(await listarJanelas(ana)).toHaveLength(1);
    expect(await listarDatasBloqueadas(ana)).toHaveLength(1);
  });

  test("corretor bloqueia uma data (idempotente) e desbloqueia", async () => {
    const { imobiliaria, corretor } = await criarAna();
    const session = sessaoDe(corretor, imobiliaria);

    const first = await bloquearData(session, { data: "2026-11-02" });
    const second = await bloquearData(session, { data: "2026-11-02" });
    expect(second).toEqual(first);
    expect((await listarDatasBloqueadas(session)).map((d) => d.data)).toEqual([
      "2026-11-02",
    ]);

    expect(await desbloquearData(session, first.id)).toEqual(first);
    expect(await listarDatasBloqueadas(session)).toEqual([]);
    // Já removida: continua null, sem erro.
    expect(await desbloquearData(session, first.id)).toBeNull();
  });

  test("administrador não tem agenda", async () => {
    await expect(listarJanelas(administrador)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});
