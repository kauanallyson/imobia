import { describe, expect, test } from "bun:test";
import {
  criarAna,
  criarBruno,
  criarCenarioDePropostaDaAna,
  criarConcorrente,
  criarEmpreendimentoDaAna,
  criarLoteECasaDaAna,
  ok,
  sessaoDe,
} from "@/test/fixtures";
import { buscarNegocio, escolherPlano } from "./negocios";
import {
  buscarPlanoDePagamento,
  calcularPlano,
  calcularPlanoParaLote,
  criarPlanoDePagamento,
  editarPlanoDePagamento,
  listarPlanosDePagamento,
  PlanoEmUsoError,
  removerPlanoDePagamento,
} from "./planos-de-pagamento";
import { gerarProposta } from "./propostas";
import { ForbiddenError } from "./session";

const entrada20 = {
  nome: "Entrada 20% + 60x",
  percentualDeEntrada: 20,
  numeroDeParcelas: 60,
  condicoes: "Correção pelo IPCA",
};

describe("calcularPlano", () => {
  test("entrada = preço × percentual; parcela = restante ÷ parcelas", () => {
    expect(
      calcularPlano({
        precoTotal: 100000,
        plano: { percentualDeEntrada: 20, numeroDeParcelas: 80 },
      }),
    ).toEqual({ entrada: 20000, parcela: 1000, parcelas: 80 });
  });

  test("arredonda em centavos: entrada para baixo, parcela para cima (teto)", () => {
    // 85.000 × 12,5% = 10.625,00; restante 74.375,00 / 36 = 2.065,9722… → 2.065,98
    expect(
      calcularPlano({
        precoTotal: 85000,
        plano: { percentualDeEntrada: 12.5, numeroDeParcelas: 36 },
      }),
    ).toEqual({ entrada: 10625, parcela: 2065.98, parcelas: 36 });
    // 1.000,01 × 33,33% = 333,3033… → 333,30; restante 666,71 / 3 = 222,2366… → 222,24
    expect(
      calcularPlano({
        precoTotal: 1000.01,
        plano: { percentualDeEntrada: 33.33, numeroDeParcelas: 3 },
      }),
    ).toEqual({ entrada: 333.3, parcela: 222.24, parcelas: 3 });
  });

  test("sem entrada e à vista são casos válidos", () => {
    expect(
      calcularPlano({
        precoTotal: 90000,
        plano: { percentualDeEntrada: 0, numeroDeParcelas: 1 },
      }),
    ).toEqual({ entrada: 0, parcela: 90000, parcelas: 1 });
    expect(
      calcularPlano({
        precoTotal: 90000,
        plano: { percentualDeEntrada: 100, numeroDeParcelas: 1 },
      }),
    ).toEqual({ entrada: 90000, parcela: 0, parcelas: 1 });
  });
});

describe("planos de pagamento", () => {
  test("corretor cadastra um plano e outro corretor da imobiliária o vê", async () => {
    const { imobiliaria, corretor } = await criarAna();
    const bruno = await criarBruno(imobiliaria);
    const session = sessaoDe(corretor, imobiliaria);
    const { empreendimento } = await criarEmpreendimentoDaAna(session);

    const plano = ok(
      await criarPlanoDePagamento(session, {
        empreendimentoId: empreendimento.id,
        ...entrada20,
      }),
    );

    expect(plano).toEqual({
      id: expect.any(String),
      empreendimentoId: empreendimento.id,
      ...entrada20,
    });
    expect(
      await listarPlanosDePagamento(
        sessaoDe(bruno, imobiliaria),
        empreendimento.id,
      ),
    ).toEqual([plano]);
  });

  test("repetir a criação com o mesmo id não duplica", async () => {
    const { imobiliaria, corretor } = await criarAna();
    const session = sessaoDe(corretor, imobiliaria);
    const { empreendimento } = await criarEmpreendimentoDaAna(session);
    const input = {
      id: crypto.randomUUID(),
      empreendimentoId: empreendimento.id,
      ...entrada20,
    };

    const [a, b] = await Promise.all([
      criarPlanoDePagamento(session, input),
      criarPlanoDePagamento(session, input),
    ]);

    expect(a).toEqual(b);
    expect(
      await listarPlanosDePagamento(session, empreendimento.id),
    ).toHaveLength(1);
  });

  test("corretor edita e remove um plano; remover de novo não falha", async () => {
    const { imobiliaria, corretor } = await criarAna();
    const session = sessaoDe(corretor, imobiliaria);
    const { empreendimento } = await criarEmpreendimentoDaAna(session);
    const plano = ok(
      await criarPlanoDePagamento(session, {
        empreendimentoId: empreendimento.id,
        ...entrada20,
      }),
    );

    const editado = await editarPlanoDePagamento(session, plano.id, {
      ...entrada20,
      numeroDeParcelas: 120,
    });
    expect(editado?.numeroDeParcelas).toBe(120);

    expect(await removerPlanoDePagamento(session, plano.id)).toBe(true);
    expect(await removerPlanoDePagamento(session, plano.id)).toBe(false);
    expect(await buscarPlanoDePagamento(session, plano.id)).toBeNull();
  });

  test("plano escolhido num negócio não pode ser removido", async () => {
    const { session, negocio, plano } = await criarCenarioDePropostaDaAna();
    expect(
      ok(await buscarNegocio(session, negocio.id)).planoEscolhido?.id,
    ).toBe(plano.id);

    await expect(
      removerPlanoDePagamento(session, plano.id),
    ).rejects.toBeInstanceOf(PlanoEmUsoError);
    expect(await buscarPlanoDePagamento(session, plano.id)).not.toBeNull();
  });

  test("plano usado numa proposta não pode ser removido, mesmo fora do negócio", async () => {
    const { session, negocio, plano, empreendimento } =
      await criarCenarioDePropostaDaAna();
    ok(await gerarProposta(session, negocio.id));
    const outro = ok(
      await criarPlanoDePagamento(session, {
        empreendimentoId: empreendimento.id,
        ...entrada20,
      }),
    );
    ok(await escolherPlano(session, negocio.id, { planoId: outro.id }));

    await expect(
      removerPlanoDePagamento(session, plano.id),
    ).rejects.toBeInstanceOf(PlanoEmUsoError);
    expect(await buscarPlanoDePagamento(session, plano.id)).not.toBeNull();
  });

  test("corretor de outra imobiliária não vê nem altera o plano", async () => {
    const { imobiliaria, corretor } = await criarAna();
    const session = sessaoDe(corretor, imobiliaria);
    const { empreendimento } = await criarEmpreendimentoDaAna(session);
    const plano = ok(
      await criarPlanoDePagamento(session, {
        empreendimentoId: empreendimento.id,
        ...entrada20,
      }),
    );
    const concorrente = (await criarConcorrente()).session;

    expect(await buscarPlanoDePagamento(concorrente, plano.id)).toBeNull();
    expect(
      await listarPlanosDePagamento(concorrente, empreendimento.id),
    ).toEqual([]);
    expect(
      await editarPlanoDePagamento(concorrente, plano.id, entrada20),
    ).toBeNull();
    expect(await removerPlanoDePagamento(concorrente, plano.id)).toBe(false);
    expect(
      await criarPlanoDePagamento(concorrente, {
        empreendimentoId: empreendimento.id,
        ...entrada20,
      }),
    ).toBeNull();
    expect(await buscarPlanoDePagamento(session, plano.id)).toEqual(plano);
  });

  test("administrador não mexe em planos; id inválido devolve null", async () => {
    const { imobiliaria, corretor } = await criarAna();
    const session = sessaoDe(corretor, imobiliaria);
    expect(
      listarPlanosDePagamento({ role: "administrador" }, crypto.randomUUID()),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(await buscarPlanoDePagamento(session, "nao-e-uuid")).toBeNull();
  });
});

describe("calcularPlanoParaLote", () => {
  test("calcula para o lote e para lote + casa", async () => {
    const { imobiliaria, corretor } = await criarAna();
    const session = sessaoDe(corretor, imobiliaria);
    const { empreendimento, lote, modelo } = await criarLoteECasaDaAna(session);
    const plano = ok(
      await criarPlanoDePagamento(session, {
        empreendimentoId: empreendimento.id,
        ...entrada20,
      }),
    );

    // Lote: 85.000 → entrada 17.000; 68.000 / 60 = 1.133,33…
    expect(
      await calcularPlanoParaLote(session, {
        loteId: lote.id,
        planoId: plano.id,
      }),
    ).toEqual({
      precoTotal: 85000,
      entrada: 17000,
      parcela: 1133.34,
      parcelas: 60,
    });
    // Lote + casa: 235.000 → entrada 47.000; 188.000 / 60 = 3.133,33…
    expect(
      await calcularPlanoParaLote(session, {
        loteId: lote.id,
        modeloDeCasaId: modelo.id,
        planoId: plano.id,
      }),
    ).toEqual({
      precoTotal: 235000,
      entrada: 47000,
      parcela: 3133.34,
      parcelas: 60,
    });
  });

  test("plano, lote ou modelo fora do escopo devolve null", async () => {
    const { imobiliaria, corretor } = await criarAna();
    const session = sessaoDe(corretor, imobiliaria);
    const { empreendimento, lote, modelo } = await criarLoteECasaDaAna(session);
    const plano = ok(
      await criarPlanoDePagamento(session, {
        empreendimentoId: empreendimento.id,
        ...entrada20,
      }),
    );
    const concorrente = (await criarConcorrente()).session;

    expect(
      await calcularPlanoParaLote(concorrente, {
        loteId: lote.id,
        modeloDeCasaId: modelo.id,
        planoId: plano.id,
      }),
    ).toBeNull();
    expect(
      await calcularPlanoParaLote(session, {
        loteId: lote.id,
        planoId: crypto.randomUUID(),
      }),
    ).toBeNull();
  });
});
