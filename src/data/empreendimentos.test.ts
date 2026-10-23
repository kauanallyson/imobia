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
  buscarEmpreendimento,
  criarEmpreendimento,
  editarEmpreendimento,
  listarEmpreendimentos,
} from "./empreendimentos";
import { criarIncorporadora } from "./incorporadoras";

describe("empreendimentos", () => {
  test("corretor cadastra um empreendimento e outro corretor da imobiliária o vê", async () => {
    const { imobiliaria, corretor } = await criarAna();
    const bruno = await criarBruno(imobiliaria);
    const { incorporadora, empreendimento } = await criarEmpreendimentoDaAna(
      sessaoDe(corretor, imobiliaria),
    );

    expect(empreendimento).toEqual({
      id: expect.any(String),
      nome: "Jardim das Flores",
      cidade: "Sobral",
      endereco: "Rod. CE-178, km 2",
      incorporadoraId: incorporadora.id,
      incorporadora: "Terra Nova",
    });
    expect(await listarEmpreendimentos(sessaoDe(bruno, imobiliaria))).toEqual([
      empreendimento,
    ]);
  });

  test("corretor edita o empreendimento", async () => {
    const { imobiliaria, corretor } = await criarAna();
    const session = sessaoDe(corretor, imobiliaria);
    const { incorporadora, empreendimento } =
      await criarEmpreendimentoDaAna(session);

    const edited = await editarEmpreendimento(session, empreendimento.id, {
      incorporadoraId: incorporadora.id,
      nome: "Jardim das Flores II",
      cidade: "Fortaleza",
      endereco: "Av. Central, 100",
    });

    expect(edited).toEqual({
      ...empreendimento,
      nome: "Jardim das Flores II",
      cidade: "Fortaleza",
      endereco: "Av. Central, 100",
    });
    expect(await buscarEmpreendimento(session, empreendimento.id)).toEqual(
      edited,
    );
  });

  test("incorporadora de outra imobiliária não pode ser usada", async () => {
    const { imobiliaria, corretor } = await criarAna();
    const concorrente = await criarConcorrente();
    const alheia = ok(
      await criarIncorporadora(concorrente.session, { nome: "Alheia" }),
    );

    const created = await criarEmpreendimento(sessaoDe(corretor, imobiliaria), {
      incorporadoraId: alheia.id,
      nome: "Invasor",
      cidade: "Sobral",
      endereco: "x",
    });

    expect(created).toBeNull();
  });

  test("outra imobiliária não vê, não busca nem edita o empreendimento", async () => {
    const { imobiliaria, corretor } = await criarAna();
    const concorrente = await criarConcorrente();
    const { incorporadora, empreendimento } = await criarEmpreendimentoDaAna(
      sessaoDe(corretor, imobiliaria),
    );

    expect(await listarEmpreendimentos(concorrente.session)).toEqual([]);
    expect(
      await buscarEmpreendimento(concorrente.session, empreendimento.id),
    ).toBeNull();
    expect(
      await editarEmpreendimento(concorrente.session, empreendimento.id, {
        incorporadoraId: incorporadora.id,
        nome: "Roubado",
        cidade: "x",
        endereco: "x",
      }),
    ).toBeNull();
  });

  test("repetir a criação com o mesmo id não duplica", async () => {
    const { imobiliaria, corretor } = await criarAna();
    const session = sessaoDe(corretor, imobiliaria);
    const incorporadora = ok(
      await criarIncorporadora(session, { nome: "Terra Nova" }),
    );
    const input = {
      id: crypto.randomUUID(),
      incorporadoraId: incorporadora.id,
      nome: "Jardim",
      cidade: "Sobral",
      endereco: "x",
    };

    const [first, second] = await Promise.all([
      criarEmpreendimento(session, input),
      criarEmpreendimento(session, input),
    ]);
    const again = await criarEmpreendimento(session, input);

    expect(second).toEqual(first);
    expect(again).toEqual(first);
    expect(await listarEmpreendimentos(session)).toHaveLength(1);
  });
});
