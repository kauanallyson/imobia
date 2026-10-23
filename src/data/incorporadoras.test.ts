import { describe, expect, setSystemTime, test } from "bun:test";
import {
  administrador,
  criarAna,
  criarBruno,
  criarConcorrente,
  ok,
  sessaoDe,
} from "@/test/fixtures";
import {
  buscarIncorporadora,
  criarIncorporadora,
  editarIncorporadora,
  listarIncorporadoras,
} from "./incorporadoras";
import { ForbiddenError } from "./session";

describe("incorporadoras", () => {
  test("corretor cadastra uma incorporadora e outro corretor da imobiliária a vê", async () => {
    setSystemTime(new Date("2026-03-10T09:30:00-03:00"));
    const { imobiliaria, corretor } = await criarAna();
    const bruno = await criarBruno(imobiliaria);

    const created = ok(
      await criarIncorporadora(sessaoDe(corretor, imobiliaria), {
        nome: "Terra Nova",
      }),
    );

    expect(created).toEqual({
      id: expect.any(String),
      nome: "Terra Nova",
      criadaEm: new Date("2026-03-10T09:30:00-03:00"),
    });
    expect(await listarIncorporadoras(sessaoDe(bruno, imobiliaria))).toEqual([
      created,
    ]);
  });

  test("corretor edita o nome da incorporadora", async () => {
    const { imobiliaria, corretor } = await criarAna();
    const session = sessaoDe(corretor, imobiliaria);
    const created = ok(
      await criarIncorporadora(session, { nome: "Tera Nova" }),
    );

    const edited = await editarIncorporadora(session, created.id, {
      nome: "Terra Nova",
    });

    expect(edited?.nome).toBe("Terra Nova");
    expect(await buscarIncorporadora(session, created.id)).toEqual(edited);
  });

  test("outra imobiliária não vê, não busca nem edita a incorporadora", async () => {
    const { imobiliaria, corretor } = await criarAna();
    const concorrente = await criarConcorrente();
    const created = ok(
      await criarIncorporadora(sessaoDe(corretor, imobiliaria), {
        nome: "Terra Nova",
      }),
    );

    expect(await listarIncorporadoras(concorrente.session)).toEqual([]);
    expect(
      await buscarIncorporadora(concorrente.session, created.id),
    ).toBeNull();
    expect(
      await editarIncorporadora(concorrente.session, created.id, {
        nome: "Roubada",
      }),
    ).toBeNull();
    expect(
      await buscarIncorporadora(sessaoDe(corretor, imobiliaria), created.id),
    ).toEqual(created);
  });

  test("administrador não mexe no catálogo; id inválido é null", async () => {
    const { imobiliaria, corretor } = await criarAna();

    await expect(
      criarIncorporadora(administrador, { nome: "X" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listarIncorporadoras(administrador)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(
      await buscarIncorporadora(sessaoDe(corretor, imobiliaria), "abc"),
    ).toBeNull();
  });

  test("repetir a criação com o mesmo id não duplica", async () => {
    const { imobiliaria, corretor } = await criarAna();
    const session = sessaoDe(corretor, imobiliaria);
    const input = { id: crypto.randomUUID(), nome: "Terra Nova" };

    const first = await criarIncorporadora(session, input);
    const again = await criarIncorporadora(session, input);
    const [a, b] = await Promise.all([
      criarIncorporadora(session, input),
      criarIncorporadora(session, input),
    ]);

    expect(again).toEqual(first);
    expect(a).toEqual(first);
    expect(b).toEqual(first);
    expect(await listarIncorporadoras(session)).toHaveLength(1);
  });
});
