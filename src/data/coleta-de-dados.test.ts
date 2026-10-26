import { describe, expect, setSystemTime, test } from "bun:test";
import { legibilidadesPedidas, roteirizarLegibilidade } from "@/test/fakes/llm";
import { arquivos } from "@/test/fakes/storage";
import {
  enviados,
  mensagemRecebida,
  simularMidia,
} from "@/test/fakes/whatsapp";
import {
  criarBruno,
  criarCenarioDeColetaDaAna,
  criarConcorrente,
  ok,
  sessaoDe,
} from "@/test/fixtures";
import {
  apagarDadosDoCliente,
  avaliarDocumento,
  buscarColeta,
  DiaDePagamentoInvalidoError,
  enviarLembretesDeColeta,
  escolherLote,
  LoteIndisponivelError,
  PrimeiraParcelaForaDoPrazoError,
  registrarDadosDoCliente,
  registrarDocumentoRecebido,
  registrarPagamento,
  registrarReferencia,
  statusDaColeta,
} from "./coleta-de-dados";
import { desligarAssistente, receberMensagem } from "./conversas";
import { buscarNegocio } from "./negocios";

const segunda9h = new Date("2026-11-02T09:00:00-03:00");

// Cliente do cenário manda uma foto (sem acionar o assistente: desligado só
// durante o envio não convém; o roteiro do LLM responde com um texto).
async function clienteMandaFoto(
  instancia: string,
  idMensagem: string,
  bytes = new Uint8Array([1, 2, 3]),
) {
  const { roteirizar } = await import("@/test/fakes/llm");
  simularMidia(idMensagem, { bytes, mimeType: "image/jpeg" });
  roteirizar({ tipo: "texto", texto: "Recebi." });
  await receberMensagem(
    mensagemRecebida({
      instancia,
      telefone: "5588999990000",
      idMensagem,
      texto: null,
      midia: {
        tipo: "imagem",
        mimetype: "image/jpeg",
        nomeDoArquivo: null,
        url: null,
      },
    }),
  );
}

describe("coleta de dados: dados do cliente", () => {
  test("e-mail, CPF, contatos, referências e pagamento ficam no cliente", async () => {
    setSystemTime(segunda9h);
    const { session, negocio } = await criarCenarioDeColetaDaAna();

    await registrarDadosDoCliente(session, negocio.id, {
      email: "carlos@email.com",
      cpf: "123.456.789-09",
      contatosExtras: ["(88) 3611-0000"],
    });
    await registrarReferencia(session, negocio.id, {
      nome: "Maria Lima",
      telefone: "(88) 99999-1111",
    });
    await registrarReferencia(session, negocio.id, {
      nome: "João Souza",
      telefone: "88999992222",
    });
    await registrarPagamento(session, negocio.id, { forma: "pix", dia: 10 });

    const coleta = ok(await buscarColeta(session, negocio.id));
    expect(coleta.cliente).toMatchObject({
      email: "carlos@email.com",
      cpf: "12345678909",
      contatosExtras: ["(88) 3611-0000"],
      referencias: [
        { nome: "Maria Lima", telefone: "5588999991111" },
        { nome: "João Souza", telefone: "5588999992222" },
      ],
      formaDePagamento: "pix",
      diaDePagamento: 10,
      primeiraParcela: "2026-11-10",
    });
  });

  test("uma referência com o mesmo telefone é atualizada, e só cabem duas", async () => {
    setSystemTime(segunda9h);
    const { session, negocio } = await criarCenarioDeColetaDaAna();
    await registrarReferencia(session, negocio.id, {
      nome: "Maria",
      telefone: "88999991111",
    });
    await registrarReferencia(session, negocio.id, {
      nome: "Maria Lima",
      telefone: "88999991111",
    });
    await registrarReferencia(session, negocio.id, {
      nome: "João",
      telefone: "88999992222",
    });
    await registrarReferencia(session, negocio.id, {
      nome: "Pedro",
      telefone: "88999993333",
    });
    const coleta = ok(await buscarColeta(session, negocio.id));
    expect(coleta.cliente.referencias.map((r) => r.nome)).toEqual([
      "João",
      "Pedro",
    ]);
  });

  test("dia de pagamento fora de 1–28 é recusado", async () => {
    setSystemTime(segunda9h);
    const { session, negocio } = await criarCenarioDeColetaDaAna();
    for (const dia of [0, 29, 31, 2.5]) {
      await expect(
        registrarPagamento(session, negocio.id, { forma: "cartao", dia }),
      ).rejects.toBeInstanceOf(DiaDePagamentoInvalidoError);
    }
  });

  test("a primeira parcela é a próxima ocorrência do dia e fica em até 90 dias", async () => {
    setSystemTime(segunda9h);
    const { session, negocio } = await criarCenarioDeColetaDaAna();
    // Dia 2 é hoje: a primeira parcela vai para o mês seguinte.
    const cliente = ok(
      await registrarPagamento(session, negocio.id, {
        forma: "cartao",
        dia: 2,
      }),
    );
    expect(cliente.primeiraParcela).toBe("2026-12-02");

    const escolhida = ok(
      await registrarPagamento(session, negocio.id, {
        forma: "cartao",
        dia: 5,
        primeiraParcela: "2027-01-05",
      }),
    );
    expect(escolhida.primeiraParcela).toBe("2027-01-05");

    await expect(
      registrarPagamento(session, negocio.id, {
        forma: "cartao",
        dia: 5,
        primeiraParcela: "2027-02-05",
      }),
    ).rejects.toBeInstanceOf(PrimeiraParcelaForaDoPrazoError);
    await expect(
      registrarPagamento(session, negocio.id, {
        forma: "cartao",
        dia: 5,
        primeiraParcela: "2026-11-01",
      }),
    ).rejects.toBeInstanceOf(PrimeiraParcelaForaDoPrazoError);
  });

  test("outro corretor (mesma ou outra imobiliária) não registra nem vê a coleta", async () => {
    setSystemTime(segunda9h);
    const { session, negocio, imobiliaria } = await criarCenarioDeColetaDaAna();
    const bruno = sessaoDe(await criarBruno(imobiliaria), imobiliaria);
    const { session: carla } = await criarConcorrente();
    for (const outro of [bruno, carla]) {
      expect(
        await registrarDadosDoCliente(outro, negocio.id, { email: "x@y.com" }),
      ).toBeNull();
      expect(
        await registrarPagamento(outro, negocio.id, { forma: "pix", dia: 5 }),
      ).toBeNull();
      expect(await buscarColeta(outro, negocio.id)).toBeNull();
      expect(await statusDaColeta(outro, negocio.id)).toBeNull();
    }
    expect(await buscarColeta(session, "não-é-uuid")).toBeNull();
  });
});

describe("coleta de dados: escolha de lote", () => {
  test("só aceita lote disponível do empreendimento do negócio", async () => {
    setSystemTime(segunda9h);
    const { session, negocio, lotes } = await criarCenarioDeColetaDaAna();

    await expect(
      escolherLote(session, negocio.id, lotes.reservado.id),
    ).rejects.toBeInstanceOf(LoteIndisponivelError);
    await expect(
      escolherLote(session, negocio.id, lotes.deOutroEmpreendimento.id),
    ).rejects.toBeInstanceOf(LoteIndisponivelError);

    const escolhido = ok(
      await escolherLote(session, negocio.id, lotes.disponivel.id),
    );
    expect(escolhido.loteInteresseId).toBe(lotes.disponivel.id);
    const { session: carla } = await criarConcorrente();
    expect(
      await escolherLote(carla, negocio.id, lotes.disponivel.id),
    ).toBeNull();
  });
});

describe("coleta de dados: documentos", () => {
  test("a foto recebida é guardada privada, avaliada e fica para o corretor decidir", async () => {
    setSystemTime(segunda9h);
    const { session, negocio, instancia, imobiliaria, cliente } =
      await criarCenarioDeColetaDaAna();
    await clienteMandaFoto(instancia, "FOTO-1", new Uint8Array([9, 9]));
    roteirizarLegibilidade({ legivel: false, motivo: "foto borrada" });

    const doc = ok(await registrarDocumentoRecebido(session, negocio.id, "rg"));
    expect(doc).toMatchObject({
      tipo: "rg",
      legivel: false,
      motivo: "foto borrada",
      aceito: null,
    });
    expect(legibilidadesPedidas).toEqual([
      { bytes: new Uint8Array([9, 9]), mimeType: "image/jpeg", tipo: "rg" },
    ]);
    const chaves = [...arquivos.keys()];
    expect(chaves).toHaveLength(1);
    expect(chaves[0]).toStartWith(
      `imobiliarias/${imobiliaria.id}/clientes/${cliente.id}/documentos/`,
    );

    // Repetir para a mesma mensagem não duplica nem baixa de novo.
    const repetido = ok(
      await registrarDocumentoRecebido(session, negocio.id, "rg"),
    );
    expect(repetido.id).toBe(doc.id);
    expect(arquivos.size).toBe(1);

    // O corretor vê por URL assinada de curta duração e aceita mesmo assim.
    const coleta = ok(await buscarColeta(session, negocio.id));
    const [listado] = coleta.documentos;
    expect(listado?.url).toStartWith(`fake://${chaves[0]}?exp=`);
    const exp = Number(listado?.url.split("exp=")[1]);
    expect(exp - segunda9h.getTime() / 1000).toBeLessThanOrEqual(600);
    expect(listado).not.toHaveProperty("chave");

    const aceito = ok(await avaliarDocumento(session, doc.id, true));
    expect(aceito.aceito).toBe(true);
    const { session: carla } = await criarConcorrente();
    expect(await avaliarDocumento(carla, doc.id, false)).toBeNull();
  });

  test("sem foto ou arquivo recebido, não há documento a registrar", async () => {
    setSystemTime(segunda9h);
    const { session, negocio } = await criarCenarioDeColetaDaAna();
    expect(
      await registrarDocumentoRecebido(session, negocio.id, "cpf"),
    ).toBeNull();
  });

  test("falha na avaliação deixa o documento sem veredito da IA", async () => {
    setSystemTime(segunda9h);
    const { session, negocio, instancia } = await criarCenarioDeColetaDaAna();
    await clienteMandaFoto(instancia, "FOTO-1");
    roteirizarLegibilidade(new Error("modelo fora do ar"));
    const doc = ok(
      await registrarDocumentoRecebido(session, negocio.id, "cpf"),
    );
    expect(doc.legivel).toBeNull();
  });
});

describe("coleta de dados: status", () => {
  test("lista o que falta e esvazia quando tudo chega", async () => {
    setSystemTime(segunda9h);
    const { session, negocio, instancia, lotes } =
      await criarCenarioDeColetaDaAna();
    expect(await statusDaColeta(session, negocio.id)).toEqual({
      completa: false,
      faltando: [
        "documento_cpf",
        "documento_rg",
        "documento_comprovante_endereco",
        "email",
        "cpf",
        "referencias",
        "forma_de_pagamento",
        "dia_de_pagamento",
        "lote",
      ],
    });

    let n = 0;
    for (const tipo of ["cpf", "rg", "comprovante_endereco"] as const) {
      await clienteMandaFoto(instancia, `FOTO-${++n}`);
      await registrarDocumentoRecebido(session, negocio.id, tipo);
    }
    await registrarDadosDoCliente(session, negocio.id, {
      email: "carlos@email.com",
      cpf: "12345678909",
    });
    await registrarReferencia(session, negocio.id, {
      nome: "Maria",
      telefone: "88999991111",
    });
    expect(ok(await statusDaColeta(session, negocio.id)).faltando).toEqual([
      "referencias",
      "forma_de_pagamento",
      "dia_de_pagamento",
      "lote",
    ]);
    await registrarReferencia(session, negocio.id, {
      nome: "João",
      telefone: "88999992222",
    });
    await registrarPagamento(session, negocio.id, { forma: "pix", dia: 10 });
    await escolherLote(session, negocio.id, lotes.disponivel.id);
    expect(await statusDaColeta(session, negocio.id)).toEqual({
      completa: true,
      faltando: [],
    });
  });

  test("documento ilegível ou rejeitado pelo corretor continua faltando", async () => {
    setSystemTime(segunda9h);
    const { session, negocio, instancia } = await criarCenarioDeColetaDaAna();
    await clienteMandaFoto(instancia, "FOTO-1");
    roteirizarLegibilidade({ legivel: false, motivo: "cortado" });
    const ilegivel = ok(
      await registrarDocumentoRecebido(session, negocio.id, "cpf"),
    );
    expect(ok(await statusDaColeta(session, negocio.id)).faltando).toContain(
      "documento_cpf",
    );
    // O corretor decide: aceitar o ilegível resolve.
    await avaliarDocumento(session, ilegivel.id, true);
    expect(
      ok(await statusDaColeta(session, negocio.id)).faltando,
    ).not.toContain("documento_cpf");

    await clienteMandaFoto(instancia, "FOTO-2");
    const rg = ok(await registrarDocumentoRecebido(session, negocio.id, "rg"));
    expect(
      ok(await statusDaColeta(session, negocio.id)).faltando,
    ).not.toContain("documento_rg");
    await avaliarDocumento(session, rg.id, false);
    expect(ok(await statusDaColeta(session, negocio.id)).faltando).toContain(
      "documento_rg",
    );
  });
});

describe("coleta de dados: exclusão (LGPD)", () => {
  test("apaga dados pessoais e arquivos; o negócio fica anonimizado", async () => {
    setSystemTime(segunda9h);
    const { session, negocio, instancia, cliente } =
      await criarCenarioDeColetaDaAna();
    await registrarDadosDoCliente(session, negocio.id, {
      email: "carlos@email.com",
      cpf: "12345678909",
      contatosExtras: ["8836110000"],
    });
    await registrarReferencia(session, negocio.id, {
      nome: "Maria",
      telefone: "88999991111",
    });
    await registrarPagamento(session, negocio.id, { forma: "pix", dia: 10 });
    await clienteMandaFoto(instancia, "FOTO-1");
    await registrarDocumentoRecebido(session, negocio.id, "cpf");
    expect(arquivos.size).toBe(1);

    const { session: carla } = await criarConcorrente();
    expect(await apagarDadosDoCliente(carla, cliente.id)).toBeNull();
    expect(arquivos.size).toBe(1);

    ok(await apagarDadosDoCliente(session, cliente.id));
    expect(arquivos.size).toBe(0);

    const detalhe = ok(await buscarNegocio(session, negocio.id));
    expect(detalhe.etapa).toBe("coletando_dados");
    expect(detalhe.cliente).toMatchObject({
      nome: "Cliente removido",
      email: null,
      cpf: null,
    });
    expect(detalhe.cliente.telefone).not.toContain("99990000");
    expect(detalhe.conversa?.mensagens).toEqual([]);
    const coleta = ok(await buscarColeta(session, negocio.id));
    expect(coleta.documentos).toEqual([]);
    expect(coleta.cliente).toMatchObject({
      contatosExtras: [],
      referencias: [],
      formaDePagamento: null,
      diaDePagamento: null,
      primeiraParcela: null,
      anonimizado: true,
    });

    // Repetir não falha.
    ok(await apagarDadosDoCliente(session, cliente.id));
  });
});

describe("coleta de dados: lembretes", () => {
  // O cenário entra em Coletando dados na segunda 02/11 às 9h.
  const em = (iso: string) => new Date(iso);

  async function preparar() {
    setSystemTime(segunda9h);
    const cenario = await criarCenarioDeColetaDaAna();
    enviados.length = 0;
    return cenario;
  }

  test("a cada 2 dias enquanto falta algo, sem duplicar no mesmo dia", async () => {
    await preparar();
    // Terça: ainda não fez 2 dias.
    setSystemTime(em("2026-11-03T10:00:00-03:00"));
    expect(await enviarLembretesDeColeta()).toEqual({ enviados: 0 });

    // Quarta: lembra, uma vez só.
    setSystemTime(em("2026-11-04T10:00:00-03:00"));
    expect(await enviarLembretesDeColeta()).toEqual({ enviados: 1 });
    setSystemTime(em("2026-11-04T15:00:00-03:00"));
    expect(await enviarLembretesDeColeta()).toEqual({ enviados: 0 });
    expect(enviados).toHaveLength(1);
    expect(enviados[0]).toMatchObject({
      tipo: "texto",
      para: "5588999990000",
    });

    // Quinta não; sexta sim.
    setSystemTime(em("2026-11-05T10:00:00-03:00"));
    expect(await enviarLembretesDeColeta()).toEqual({ enviados: 0 });
    setSystemTime(em("2026-11-06T10:00:00-03:00"));
    expect(await enviarLembretesDeColeta()).toEqual({ enviados: 1 });
  });

  test("respeita 8h–20h de segunda a sábado", async () => {
    await preparar();
    setSystemTime(em("2026-11-04T07:30:00-03:00"));
    expect(await enviarLembretesDeColeta()).toEqual({ enviados: 0 });
    setSystemTime(em("2026-11-04T20:30:00-03:00"));
    expect(await enviarLembretesDeColeta()).toEqual({ enviados: 0 });
    // Domingo 08/11 (último em sexta 06... aqui nenhum enviado): não envia.
    setSystemTime(em("2026-11-08T10:00:00-03:00"));
    expect(await enviarLembretesDeColeta()).toEqual({ enviados: 0 });
    setSystemTime(em("2026-11-09T08:00:00-03:00"));
    expect(await enviarLembretesDeColeta()).toEqual({ enviados: 1 });
  });

  test("nada falta, conversa pausada ou fora de Coletando dados: não lembra", async () => {
    const { session, negocio, lotes, instancia, conversa } =
      await (async () => {
        const c = await preparar();
        const detalhe = ok(await buscarNegocio(c.session, c.negocio.id));
        return { ...c, conversa: ok(detalhe.conversa) };
      })();
    setSystemTime(em("2026-11-04T10:00:00-03:00"));
    await desligarAssistente(session, conversa.id);
    expect(await enviarLembretesDeColeta()).toEqual({ enviados: 0 });
    const { ligarAssistente } = await import("./conversas");
    await ligarAssistente(session, conversa.id);

    let n = 0;
    for (const tipo of ["cpf", "rg", "comprovante_endereco"] as const) {
      await clienteMandaFoto(instancia, `FOTO-${++n}`);
      await registrarDocumentoRecebido(session, negocio.id, tipo);
    }
    await registrarDadosDoCliente(session, negocio.id, {
      email: "c@e.com",
      cpf: "12345678909",
    });
    await registrarReferencia(session, negocio.id, {
      nome: "Maria",
      telefone: "88999991111",
    });
    await registrarReferencia(session, negocio.id, {
      nome: "João",
      telefone: "88999992222",
    });
    await registrarPagamento(session, negocio.id, { forma: "pix", dia: 10 });
    await escolherLote(session, negocio.id, lotes.disponivel.id);
    enviados.length = 0;
    expect(await enviarLembretesDeColeta()).toEqual({ enviados: 0 });
  });
});
