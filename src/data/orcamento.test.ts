import { describe, expect, test } from "bun:test";
import {
  criarAna,
  criarConcorrente,
  criarEmpreendimentoDaAna,
  ok,
  sessaoDe,
} from "@/test/fixtures";
import { criarLote, type Lote } from "./lotes";
import type { ModeloDeCasa } from "./modelos-de-casa";
import {
  escolherOpcao,
  filtrarPorOrcamento,
  montarOpcoes,
  opcaoMaisProxima,
  opcoesDentroDoOrcamento,
} from "./orcamento";
import {
  criarPlanoDePagamento,
  type PlanoDePagamento,
} from "./planos-de-pagamento";

const empreendimentoId = "11111111-1111-4111-8111-111111111111";

function lote(numero: string, preco: number): Lote {
  return {
    id: `lote-${numero}`,
    empreendimentoId,
    quadra: "A",
    numero,
    area: 360,
    frente: 12,
    fundo: 30,
    preco,
    status: "disponivel",
  };
}

function plano(
  nome: string,
  percentualDeEntrada: number,
  numeroDeParcelas: number,
): PlanoDePagamento {
  return {
    id: `plano-${nome}`,
    empreendimentoId,
    nome,
    percentualDeEntrada,
    numeroDeParcelas,
    condicoes: "",
  };
}

const casa: ModeloDeCasa = {
  id: "casa-1",
  empreendimentoId,
  nome: "Casa 2 quartos",
  areaConstruida: 70,
  quartos: 2,
  banheiros: 1,
  suites: 0,
  vagas: 1,
  preco: 150000,
};

// Lotes de R$ 60 mil, R$ 85 mil e R$ 120 mil; planos 20% em 60x e 10% em
// 120x. Valores esperados calculados à mão a partir da regra provisória.
const lotes = [lote("1", 60000), lote("2", 85000), lote("3", 120000)];
const planos = [plano("60x", 20, 60), plano("120x", 10, 120)];

describe("orçamento: filtro de opções (lógica pura)", () => {
  test("monta todas as combinações lote × plano e ordena pela parcela", () => {
    const opcoes = montarOpcoes({ interesse: "lote", lotes, planos });

    expect(
      opcoes.map((o) => [o.lote.numero, o.plano.nome, o.entrada, o.parcela]),
    ).toEqual([
      ["1", "120x", 6000, 450],
      ["2", "120x", 8500, 637.5],
      ["1", "60x", 12000, 800],
      ["3", "120x", 12000, 900],
      ["2", "60x", 17000, 1133.34],
      ["3", "60x", 24000, 1600],
    ]);
  });

  test("lote + casa soma o preço do modelo antes de calcular", () => {
    const opcoes = montarOpcoes({
      interesse: "lote_e_casa",
      lotes: [lotes[0] as Lote],
      modelos: [casa],
      planos: [planos[0] as PlanoDePagamento],
    });

    expect(opcoes).toHaveLength(1);
    expect(opcoes[0]).toMatchObject({
      modeloDeCasa: { nome: "Casa 2 quartos" },
      precoTotal: 210000,
      entrada: 42000,
      parcela: 2800,
      parcelas: 60,
    });
  });

  test("devolve só as combinações cuja entrada e parcela cabem no orçamento", () => {
    const opcoes = montarOpcoes({ interesse: "lote", lotes, planos });

    const dentro = filtrarPorOrcamento(opcoes, {
      entrada: 12000,
      parcelaMaxima: 850,
    });

    expect(dentro.map((o) => [o.lote.numero, o.plano.nome])).toEqual([
      ["1", "120x"],
      ["2", "120x"],
      ["1", "60x"],
    ]);
  });

  test("a parcela que estoura por um centavo fica de fora", () => {
    const opcoes = montarOpcoes({ interesse: "lote", lotes, planos });

    const dentro = filtrarPorOrcamento(opcoes, {
      entrada: 100000,
      parcelaMaxima: 1133.33,
    });

    expect(dentro.map((o) => [o.lote.numero, o.plano.nome])).not.toContainEqual(
      ["2", "60x"],
    );
    expect(dentro).toHaveLength(4);
  });

  test("sem combinação possível, a mais próxima é a de menor estouro", () => {
    const opcoes = montarOpcoes({ interesse: "lote", lotes, planos });

    // Entrada cabe em tudo; a parcela de R$ 400 fica abaixo de todas: a que
    // menos estoura é o lote 1 em 120x (R$ 450).
    const proxima = opcaoMaisProxima(opcoes, {
      entrada: 50000,
      parcelaMaxima: 400,
    });

    expect(proxima).toMatchObject({
      lote: { numero: "1" },
      plano: { nome: "120x" },
      estouro: 50,
    });
  });

  test("empate no estouro prefere o lote mais barato", () => {
    // Lote 1 em 60x: entrada 12.000, parcela 800. Lote 3 em 120x: entrada
    // 12.000, parcela 900. Orçamento de entrada 11.000 e parcela 1.000: ambos
    // estouram R$ 1.000 na entrada; vence o lote mais barato (3 antes de 1
    // na lista, para o empate não depender da ordem).
    const opcoes = [
      ...montarOpcoes({
        interesse: "lote",
        lotes: [lotes[2] as Lote],
        planos: [planos[1] as PlanoDePagamento],
      }),
      ...montarOpcoes({
        interesse: "lote",
        lotes: [lotes[0] as Lote],
        planos: [planos[0] as PlanoDePagamento],
      }),
    ];

    const proxima = opcaoMaisProxima(opcoes, {
      entrada: 11000,
      parcelaMaxima: 1000,
    });

    expect(proxima).toMatchObject({
      lote: { numero: "1" },
      plano: { nome: "60x" },
      estouro: 1000,
    });
  });

  test("escolherOpcao devolve as que cabem ou, sem nenhuma, a mais próxima marcada fora do orçamento", () => {
    const opcoes = montarOpcoes({ interesse: "lote", lotes, planos });

    expect(
      escolherOpcao(opcoes, { entrada: 12000, parcelaMaxima: 850 }),
    ).toMatchObject({ foraDoOrcamento: false, opcoes: expect.any(Array) });
    expect(
      escolherOpcao(opcoes, { entrada: 1000, parcelaMaxima: 100 }),
    ).toMatchObject({
      foraDoOrcamento: true,
      maisProxima: { lote: { numero: "1" }, plano: { nome: "120x" } },
    });
    expect(escolherOpcao([], { entrada: 1000, parcelaMaxima: 100 })).toEqual({
      foraDoOrcamento: true,
      maisProxima: null,
    });
  });
});

describe("orçamento: opções do empreendimento", () => {
  test("considera só lotes disponíveis do empreendimento da imobiliária", async () => {
    const { imobiliaria, corretor } = await criarAna();
    const session = sessaoDe(corretor, imobiliaria);
    const { empreendimento } = await criarEmpreendimentoDaAna(session);
    const barato = ok(
      await criarLote(session, {
        empreendimentoId: empreendimento.id,
        quadra: "A",
        numero: "1",
        area: 360,
        frente: 12,
        fundo: 30,
        preco: 60000,
      }),
    );
    const reservado = ok(
      await criarLote(session, {
        empreendimentoId: empreendimento.id,
        quadra: "A",
        numero: "2",
        area: 360,
        frente: 12,
        fundo: 30,
        preco: 50000,
      }),
    );
    const { alterarStatusDoLote } = await import("./lotes");
    await alterarStatusDoLote(session, reservado.id, "reservado");
    ok(
      await criarPlanoDePagamento(session, {
        empreendimentoId: empreendimento.id,
        nome: "120x",
        percentualDeEntrada: 10,
        numeroDeParcelas: 120,
        condicoes: "",
      }),
    );

    const resultado = await opcoesDentroDoOrcamento(session, {
      empreendimentoId: empreendimento.id,
      interesse: "lote",
      entrada: 10000,
      parcelaMaxima: 500,
    });

    expect(resultado).toMatchObject({ foraDoOrcamento: false });
    expect(
      resultado?.foraDoOrcamento === false
        ? resultado.opcoes.map((o) => o.lote.id)
        : [],
    ).toEqual([barato.id]);

    const concorrente = await criarConcorrente();
    expect(
      await opcoesDentroDoOrcamento(concorrente.session, {
        empreendimentoId: empreendimento.id,
        interesse: "lote",
        entrada: 10000,
        parcelaMaxima: 500,
      }),
    ).toBeNull();
  });
});

describe("orçamento: registro no negócio", () => {
  test("registra o orçamento, escolhe o plano com lote e marca fora do orçamento (idempotente)", async () => {
    const { criarNegocioDaAna, criarLoteECasaDaAna } = await import(
      "@/test/fixtures"
    );
    const {
      buscarNegocio,
      escolherPlano,
      marcarForaDoOrcamento,
      registrarOrcamento,
    } = await import("./negocios");
    const { session, negocio } = await criarNegocioDaAna();
    const { empreendimento, lote, modelo } = await criarLoteECasaDaAna(session);
    const planoDePagamento = ok(
      await criarPlanoDePagamento(session, {
        empreendimentoId: empreendimento.id,
        nome: "120x",
        percentualDeEntrada: 10,
        numeroDeParcelas: 120,
        condicoes: "",
      }),
    );

    const comOrcamento = await registrarOrcamento(session, negocio.id, {
      entrada: 1000000,
      parcelaMaxima: 80000,
    });
    expect(comOrcamento).toMatchObject({
      orcamentoEntrada: 1000000,
      orcamentoParcelaMaxima: 80000,
      foraDoOrcamento: false,
      planoEscolhidoId: null,
    });

    const comPlano = await escolherPlano(session, negocio.id, {
      planoId: planoDePagamento.id,
      loteId: lote.id,
      modeloDeCasaId: modelo.id,
    });
    expect(comPlano).toMatchObject({
      planoEscolhidoId: planoDePagamento.id,
      loteInteresseId: lote.id,
      interesse: "lote_e_casa",
      empreendimentoInteresseId: empreendimento.id,
    });
    expect(
      await escolherPlano(session, negocio.id, {
        planoId: planoDePagamento.id,
        loteId: lote.id,
        modeloDeCasaId: modelo.id,
      }),
    ).toEqual(comPlano);

    const fora = await marcarForaDoOrcamento(session, negocio.id);
    expect(fora?.foraDoOrcamento).toBe(true);
    expect(await marcarForaDoOrcamento(session, negocio.id)).toEqual(fora);

    const detalhe = await buscarNegocio(session, negocio.id);
    expect(detalhe?.planoEscolhido).toMatchObject({
      id: planoDePagamento.id,
      nome: "120x",
      calculo: { entrada: 23500, parcela: 1762.5, parcelas: 120 },
    });
  });

  test("plano de outro empreendimento (ou fora da imobiliária) não é escolhido", async () => {
    const { criarNegocioDaAna } = await import("@/test/fixtures");
    const { escolherPlano, registrarOrcamento } = await import("./negocios");
    const { session, negocio } = await criarNegocioDaAna();
    const concorrente = await criarConcorrente();
    const { empreendimento: alheio } = await criarEmpreendimentoDaAna(
      concorrente.session,
    );
    const planoAlheio = ok(
      await criarPlanoDePagamento(concorrente.session, {
        empreendimentoId: alheio.id,
        nome: "Alheio",
        percentualDeEntrada: 10,
        numeroDeParcelas: 10,
        condicoes: "",
      }),
    );

    expect(
      await escolherPlano(session, negocio.id, { planoId: planoAlheio.id }),
    ).toBeNull();
    expect(
      await registrarOrcamento(concorrente.session, negocio.id, {
        entrada: 100,
        parcelaMaxima: 100,
      }),
    ).toBeNull();
  });
});
