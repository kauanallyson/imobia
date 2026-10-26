import { describe, expect, setSystemTime, test } from "bun:test";
import { pedidos, roteirizar, roteirizarLegibilidade } from "@/test/fakes/llm";
import { arquivos } from "@/test/fakes/storage";
import { mensagemRecebida, simularMidia } from "@/test/fakes/whatsapp";
import {
  criarCenarioDeColetaDaAna,
  criarCenarioDeVisitaDaAna,
  ok,
} from "@/test/fixtures";
import { buscarColeta } from "../../coleta-de-dados";
import { receberMensagem } from "../../conversas";
import { buscarNegocio } from "../../negocios";

const segunda9h = new Date("2026-11-02T09:00:00-03:00");
const telefone = "5588999990000";

// Resultado da i-ésima ferramenta pedida na primeira rodada.
const resultado = (i = 0) =>
  pedidos[1]?.respostaAnterior?.resultados[i]?.resultado;

describe("assistente: coleta de dados", () => {
  test("iniciar_coleta leva a Coletando dados e diz o que falta", async () => {
    setSystemTime(segunda9h);
    const { instancia, session, negocio } = await criarCenarioDeVisitaDaAna();
    roteirizar(
      {
        tipo: "chamadas",
        chamadas: [{ nome: "iniciar_coleta", argumentos: {} }],
      },
      { tipo: "texto", texto: "Ótimo! Me envie uma foto do CPF." },
    );
    await receberMensagem(
      mensagemRecebida({ instancia, telefone, texto: "Gostei, quero fechar" }),
    );

    const detalhe = ok(await buscarNegocio(session, negocio.id));
    expect(detalhe.etapa).toBe("coletando_dados");
    expect(
      detalhe.historico.find((h) => h.para === "coletando_dados"),
    ).toMatchObject({ de: "em_atendimento", autor: "assistente" });
    expect(resultado()).toMatchObject({
      etapa: "coletando_dados",
      faltando: expect.arrayContaining([
        expect.objectContaining({ item: "documento_cpf" }),
      ]),
    });
  });

  test("foto ilegível é guardada e o modelo é instruído a pedir reenvio", async () => {
    setSystemTime(segunda9h);
    const { instancia, session, negocio } = await criarCenarioDeColetaDaAna();
    simularMidia("FOTO-RG", {
      bytes: new Uint8Array([7]),
      mimeType: "image/jpeg",
    });
    roteirizarLegibilidade({ legivel: false, motivo: "foto escura" });
    roteirizar(
      {
        tipo: "chamadas",
        chamadas: [{ nome: "registrar_documento", argumentos: { tipo: "rg" } }],
      },
      { tipo: "texto", texto: "A foto ficou escura, pode reenviar?" },
    );
    await receberMensagem(
      mensagemRecebida({
        instancia,
        telefone,
        idMensagem: "FOTO-RG",
        texto: null,
        midia: {
          tipo: "imagem",
          mimetype: "image/jpeg",
          nomeDoArquivo: null,
          url: null,
        },
      }),
    );

    expect(resultado()).toMatchObject({
      tipo: "rg",
      legivel: false,
      motivo: "foto escura",
      instrucao: expect.stringContaining("reenviar"),
    });
    expect(arquivos.size).toBe(1);
    const coleta = ok(await buscarColeta(session, negocio.id));
    expect(coleta.documentos).toMatchObject([
      { tipo: "rg", legivel: false, aceito: null },
    ]);
  });

  test("dados, referência, pagamento e lote pela conversa; erros voltam ao modelo", async () => {
    setSystemTime(segunda9h);
    const { instancia, session, negocio, lotes } =
      await criarCenarioDeColetaDaAna();
    roteirizar(
      {
        tipo: "chamadas",
        chamadas: [
          {
            nome: "registrar_dados_do_cliente",
            argumentos: { email: "carlos@email.com", cpf: "123.456.789-09" },
          },
          {
            nome: "registrar_referencia",
            argumentos: { nome: "Maria", telefone: "88999991111" },
          },
          {
            nome: "registrar_pagamento",
            argumentos: { forma: "cartao", dia: 30 },
          },
          {
            nome: "escolher_lote",
            argumentos: { loteId: lotes.reservado.id },
          },
          {
            nome: "registrar_pagamento",
            argumentos: { forma: "cartao", dia: 15 },
          },
          {
            nome: "escolher_lote",
            argumentos: { loteId: lotes.disponivel.id },
          },
          { nome: "status_da_coleta", argumentos: {} },
        ],
      },
      { tipo: "texto", texto: "Anotado!" },
    );
    await receberMensagem(
      mensagemRecebida({ instancia, telefone, texto: "Seguem meus dados" }),
    );

    expect(resultado(2)).toMatchObject({ erro: expect.any(String) });
    expect(resultado(3)).toMatchObject({
      erro: expect.any(String),
      disponiveis: [{ loteId: lotes.disponivel.id }],
    });
    expect(resultado(4)).toMatchObject({
      forma: "cartao",
      dia: 15,
      primeiraParcela: "2026-11-15",
    });
    expect(resultado(6)).toMatchObject({
      completa: false,
      faltando: [
        { item: "documento_cpf" },
        { item: "documento_rg" },
        { item: "documento_comprovante_endereco" },
        { item: "referencias" },
      ],
    });
    const coleta = ok(await buscarColeta(session, negocio.id));
    expect(coleta.cliente).toMatchObject({
      email: "carlos@email.com",
      cpf: "12345678909",
      referencias: [{ nome: "Maria", telefone: "5588999991111" }],
      formaDePagamento: "cartao",
      diaDePagamento: 15,
    });
    expect(ok(await buscarNegocio(session, negocio.id)).loteInteresseId).toBe(
      lotes.disponivel.id,
    );
  });

  test("as ferramentas e a seção do prompt são oferecidas ao modelo", async () => {
    setSystemTime(segunda9h);
    const { instancia } = await criarCenarioDeColetaDaAna();
    roteirizar({ tipo: "texto", texto: "Olá" });
    await receberMensagem(mensagemRecebida({ instancia, telefone }));
    const pedido = ok(pedidos[0]);
    expect(pedido.ferramentas.map((f) => f.nome)).toEqual(
      expect.arrayContaining([
        "iniciar_coleta",
        "registrar_dados_do_cliente",
        "registrar_referencia",
        "registrar_pagamento",
        "registrar_documento",
        "escolher_lote",
        "status_da_coleta",
      ]),
    );
    expect(pedido.instrucoes).toContain("## Coleta de dados");
    expect(pedido.instrucoes).toContain("Este negócio está em Coletando dados");
  });
});
