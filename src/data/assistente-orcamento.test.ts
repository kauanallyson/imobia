import { describe, expect, test } from "bun:test";
import { pedidos, roteirizar } from "@/test/fakes/llm";
import { enviados, mensagemRecebida } from "@/test/fakes/whatsapp";
import {
  conectarWhatsappDaAna,
  criarConcorrente,
  criarEmpreendimentoDaAna,
  criarLotesEPlanosDaAna,
} from "@/test/fixtures";
import { receberMensagem } from "./conversas";
import { buscarNegocio, listarNegocios } from "./negocios";

const telefone = "5588999990000";

function resultados(rodada: number) {
  return pedidos[rodada]?.respostaAnterior?.resultados.map((r) => r.resultado);
}

describe("assistente: orçamento e planos", () => {
  test("orçamento informado fica registrado no negócio, em centavos", async () => {
    const { session, instancia } = await conectarWhatsappDaAna();
    roteirizar(
      {
        tipo: "chamadas",
        chamadas: [
          {
            nome: "registrar_orcamento",
            argumentos: { entrada: 12000.5, parcelaMaxima: 850 },
          },
        ],
      },
      { tipo: "texto", texto: "Anotado! Vou ver o que cabe." },
    );

    await receberMensagem(
      mensagemRecebida({
        instancia,
        telefone,
        texto: "Tenho 12 mil e quinhentos de entrada e pago até 850 por mês",
      }),
    );

    const [negocio] = await listarNegocios(session);
    expect(negocio).toMatchObject({
      orcamentoEntrada: 1200050,
      orcamentoParcelaMaxima: 85000,
      foraDoOrcamento: false,
    });
    expect(resultados(1)).toEqual([{ entrada: 12000.5, parcelaMaxima: 850 }]);
    expect(pedidos[0]?.instrucoes).toContain("## Orçamento e planos");
    expect(pedidos[0]?.ferramentas.map((f) => f.nome)).toEqual(
      expect.arrayContaining([
        "registrar_orcamento",
        "listar_opcoes_no_orcamento",
        "escolher_plano",
        "pedido_de_desconto",
      ]),
    );
  });

  test("a ferramenta de opções devolve só combinações plano + lote dentro do orçamento, e o cliente escolhe uma", async () => {
    const { session, instancia } = await conectarWhatsappDaAna();
    const { lotes, plano60, plano120 } = await criarLotesEPlanosDaAna(session);
    roteirizar(
      {
        tipo: "chamadas",
        chamadas: [
          { nome: "registrar_interesse", argumentos: { interesse: "lote" } },
          {
            nome: "registrar_orcamento",
            argumentos: { entrada: 12000, parcelaMaxima: 850 },
          },
          { nome: "listar_opcoes_no_orcamento", argumentos: {} },
        ],
      },
      {
        tipo: "chamadas",
        chamadas: [
          {
            nome: "escolher_plano",
            argumentos: { planoId: plano120.id, loteId: lotes[1]?.id },
          },
        ],
      },
      { tipo: "texto", texto: "Fechado: lote A-2 em 120x." },
    );

    await receberMensagem(
      mensagemRecebida({ instancia, telefone, texto: "Quero um lote" }),
    );

    const opcoes = resultados(1)?.[2] as {
      dentroDoOrcamento: boolean;
      opcoes: Array<Record<string, unknown>>;
    };
    expect(opcoes.dentroDoOrcamento).toBe(true);
    expect(
      opcoes.opcoes.map((o) => [o.lote, o.plano, o.entrada, o.parcela]),
    ).toEqual([
      ["Quadra A, lote 1", "120x", 6000, 450],
      ["Quadra A, lote 2", "120x", 8500, 637.5],
      ["Quadra A, lote 1", "60x", 12000, 800],
    ]);
    expect(opcoes.opcoes.map((o) => o.planoId)).toContain(plano60.id);

    const [negocio] = await listarNegocios(session);
    expect(negocio).toMatchObject({
      planoEscolhidoId: plano120.id,
      loteInteresseId: lotes[1]?.id,
      foraDoOrcamento: false,
    });
    const detalhe = await buscarNegocio(session, negocio.id);
    expect(detalhe?.planoEscolhido).toMatchObject({
      nome: "120x",
      calculo: { entrada: 8500, parcela: 637.5 },
    });
    expect(enviados.at(-1)).toMatchObject({
      texto: "Fechado: lote A-2 em 120x.",
    });
  });

  test("sem combinação possível, a opção mais próxima é devolvida e o negócio fica fora do orçamento", async () => {
    const { session, instancia } = await conectarWhatsappDaAna();
    const { lotes, plano120 } = await criarLotesEPlanosDaAna(session);
    roteirizar(
      {
        tipo: "chamadas",
        chamadas: [
          { nome: "registrar_interesse", argumentos: { interesse: "lote" } },
          {
            nome: "registrar_orcamento",
            argumentos: { entrada: 5000, parcelaMaxima: 400 },
          },
          { nome: "listar_opcoes_no_orcamento", argumentos: {} },
        ],
      },
      { tipo: "texto", texto: "Infelizmente nada cabe; a mais próxima é..." },
    );

    await receberMensagem(
      mensagemRecebida({ instancia, telefone, texto: "Quero um lote" }),
    );

    expect(resultados(1)?.[2]).toMatchObject({
      dentroDoOrcamento: false,
      opcoes: [],
      opcaoMaisProxima: {
        loteId: lotes[0]?.id,
        planoId: plano120.id,
        entrada: 6000,
        parcela: 450,
        estouro: 1050,
      },
    });
    const [negocio] = await listarNegocios(session);
    expect(negocio.foraDoOrcamento).toBe(true);
    expect(negocio.etapa).toBe("em_atendimento");
  });

  test("sem orçamento ou interesse registrados, a ferramenta pede ao modelo que pergunte antes", async () => {
    const { instancia } = await conectarWhatsappDaAna();
    roteirizar(
      {
        tipo: "chamadas",
        chamadas: [{ nome: "listar_opcoes_no_orcamento", argumentos: {} }],
      },
      { tipo: "texto", texto: "Quanto você pode dar de entrada?" },
    );

    await receberMensagem(mensagemRecebida({ instancia, telefone }));

    expect(resultados(1)).toEqual([
      { erro: expect.stringContaining("Orçamento ainda não registrado") },
    ]);
  });

  test("pedido de desconto não negocia: devolve a instrução de encaminhar ao corretor", async () => {
    const { instancia } = await conectarWhatsappDaAna();
    roteirizar(
      {
        tipo: "chamadas",
        chamadas: [
          {
            nome: "pedido_de_desconto",
            argumentos: { detalhe: "pediu 10% na entrada" },
          },
        ],
      },
      { tipo: "texto", texto: "A Ana vai falar com você sobre isso." },
    );

    await receberMensagem(
      mensagemRecebida({ instancia, telefone, texto: "Faz 10% de desconto?" }),
    );

    expect(resultados(1)).toEqual([
      {
        registrado: false,
        detalhe: "pediu 10% na entrada",
        instrucao: expect.stringContaining("corretor"),
      },
    ]);
  });

  test("as ferramentas não alcançam planos nem empreendimentos de outra imobiliária", async () => {
    const { session, instancia } = await conectarWhatsappDaAna();
    const concorrente = await criarConcorrente();
    const { empreendimento: alheio, plano120: planoAlheio } =
      await criarLotesEPlanosDaAna(concorrente.session);
    await criarEmpreendimentoDaAna(session);
    roteirizar(
      {
        tipo: "chamadas",
        chamadas: [
          { nome: "registrar_interesse", argumentos: { interesse: "lote" } },
          {
            nome: "registrar_orcamento",
            argumentos: { entrada: 50000, parcelaMaxima: 5000 },
          },
          {
            nome: "listar_opcoes_no_orcamento",
            argumentos: { empreendimentoId: alheio.id },
          },
          { nome: "escolher_plano", argumentos: { planoId: planoAlheio.id } },
        ],
      },
      { tipo: "texto", texto: "Vou verificar com a Ana." },
    );

    await receberMensagem(mensagemRecebida({ instancia, telefone }));

    const r = resultados(1);
    expect(r?.[2]).toEqual({ erro: expect.any(String) });
    expect(r?.[3]).toEqual({ erro: expect.any(String) });
    const [negocio] = await listarNegocios(session);
    expect(negocio.planoEscolhidoId).toBeNull();
    expect(negocio.foraDoOrcamento).toBe(false);
  });
});
