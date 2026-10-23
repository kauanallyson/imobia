import { describe, expect, test } from "bun:test";
import {
  criarAna,
  criarBruno,
  criarConcorrente,
  criarEmpreendimentoDaAna,
  ok,
  sessaoDe,
} from "@/test/fixtures";
import {
  buscarModeloDeCasa,
  criarModeloDeCasa,
  editarModeloDeCasa,
  listarModelosDeCasa,
} from "./modelos-de-casa";

const casa = {
  nome: "Casa 2 quartos",
  areaConstruida: 62.5,
  quartos: 2,
  banheiros: 1,
  suites: 0,
  vagas: 1,
  preco: 180000,
};

describe("modelos de casa", () => {
  test("corretor cadastra um modelo de casa e outro corretor da imobiliária o vê", async () => {
    const { imobiliaria, corretor } = await criarAna();
    const bruno = await criarBruno(imobiliaria);
    const session = sessaoDe(corretor, imobiliaria);
    const { empreendimento } = await criarEmpreendimentoDaAna(session);

    const modelo = ok(
      await criarModeloDeCasa(session, {
        empreendimentoId: empreendimento.id,
        ...casa,
      }),
    );

    expect(modelo).toEqual({
      id: expect.any(String),
      empreendimentoId: empreendimento.id,
      ...casa,
    });
    expect(
      await listarModelosDeCasa(
        sessaoDe(bruno, imobiliaria),
        empreendimento.id,
      ),
    ).toEqual([modelo]);
  });

  test("corretor edita o modelo de casa", async () => {
    const { imobiliaria, corretor } = await criarAna();
    const session = sessaoDe(corretor, imobiliaria);
    const { empreendimento } = await criarEmpreendimentoDaAna(session);
    const modelo = ok(
      await criarModeloDeCasa(session, {
        empreendimentoId: empreendimento.id,
        ...casa,
      }),
    );

    const edited = await editarModeloDeCasa(session, modelo.id, {
      ...casa,
      quartos: 3,
      suites: 1,
    });

    expect(edited).toEqual({ ...modelo, quartos: 3, suites: 1 });
    expect(await buscarModeloDeCasa(session, modelo.id)).toEqual(edited);
  });

  test("outra imobiliária não vê, não busca nem edita o modelo de casa", async () => {
    const { imobiliaria, corretor } = await criarAna();
    const concorrente = await criarConcorrente();
    const session = sessaoDe(corretor, imobiliaria);
    const { empreendimento } = await criarEmpreendimentoDaAna(session);
    const modelo = ok(
      await criarModeloDeCasa(session, {
        empreendimentoId: empreendimento.id,
        ...casa,
      }),
    );

    expect(
      await criarModeloDeCasa(concorrente.session, {
        empreendimentoId: empreendimento.id,
        ...casa,
      }),
    ).toBeNull();
    expect(
      await listarModelosDeCasa(concorrente.session, empreendimento.id),
    ).toEqual([]);
    expect(await buscarModeloDeCasa(concorrente.session, modelo.id)).toBeNull();
    expect(
      await editarModeloDeCasa(concorrente.session, modelo.id, casa),
    ).toBeNull();
  });

  test("repetir a criação com o mesmo id não duplica", async () => {
    const { imobiliaria, corretor } = await criarAna();
    const session = sessaoDe(corretor, imobiliaria);
    const { empreendimento } = await criarEmpreendimentoDaAna(session);
    const input = {
      id: crypto.randomUUID(),
      empreendimentoId: empreendimento.id,
      ...casa,
    };

    const [first, second] = await Promise.all([
      criarModeloDeCasa(session, input),
      criarModeloDeCasa(session, input),
    ]);

    expect(second).toEqual(first);
    expect(await listarModelosDeCasa(session, empreendimento.id)).toHaveLength(
      1,
    );
  });
});
