import { describe, expect, setSystemTime, test } from "bun:test";
import { arquivos } from "@/test/fakes/storage";
import { enviados } from "@/test/fakes/whatsapp";
import {
  clienteEnviaArquivo,
  criarBruno,
  criarCenarioDeAssinaturaDaAna,
  criarConcorrente,
  ok,
  sessaoDe,
} from "@/test/fixtures";
import {
  buscarFechamento,
  confirmarAssinatura,
  confirmarPagamento,
  enviarLembretesDeEtapasFinais,
  ForaDaEtapaError,
  registrarComprovanteDePagamento,
  registrarPropostaAssinada,
  rejeitarAssinatura,
  SemInstrucoesDePagamentoError,
  SemPropostaAssinadaError,
} from "./assinatura-e-pagamento";
import { OptOutError } from "./assistente/contexto";
import {
  apagarDadosDoCliente,
  buscarColeta,
  registrarDocumentoRecebido,
} from "./coleta-de-dados";
import { desligarAssistente, registrarOptOut } from "./estado-do-assistente";
import { definirInstrucoesDePagamento } from "./incorporadoras";
import { buscarLote } from "./lotes";
import { buscarNegocio } from "./negocios";
import { listarPendencias } from "./pendencias";
import { buscarPropostaDoNegocio, expirarReservas } from "./propostas";

// Segunda, 2/11/2026, 9h: a proposta é enviada e o lote fica reservado até
// quinta, 5/11, 9h.
const segunda9h = new Date("2026-11-02T09:00:00-03:00");
const em = (iso: string) => new Date(`${iso}-03:00`);

type Cenario = Awaited<ReturnType<typeof criarCenarioDeAssinaturaDaAna>>;

async function clienteDevolveAssinada(c: Cenario, idMensagem = "PDF-ASSINADO") {
  await clienteEnviaArquivo({ instancia: c.instancia, idMensagem });
  return ok(await registrarPropostaAssinada(c.session, c.negocio.id));
}

async function chegarAoPagamento(c: Cenario) {
  await clienteDevolveAssinada(c);
  ok(await confirmarAssinatura(c.session, c.negocio.id));
  enviados.length = 0;
}

async function clienteMandaComprovante(c: Cenario, idMensagem = "COMPROVANTE") {
  await clienteEnviaArquivo({
    instancia: c.instancia,
    idMensagem,
    tipo: "imagem",
    mimetype: "image/jpeg",
    nomeDoArquivo: null,
  });
  return ok(await registrarComprovanteDePagamento(c.session, c.negocio.id));
}

const textosEnviados = () =>
  enviados.flatMap((e) => (e.tipo === "texto" ? [e.texto] : []));

const pendenciasDoTipo = async (c: Cenario, tipo: string) =>
  (await listarPendencias(c.session)).filter((p) => p.tipo === tipo);

describe("assinatura: proposta assinada recebida", () => {
  test("o PDF é guardado, anexado à proposta e gera a pendência", async () => {
    setSystemTime(segunda9h);
    const c = await criarCenarioDeAssinaturaDaAna();
    const arquivo = await clienteDevolveAssinada(c);

    expect(arquivo).toMatchObject({
      tipo: "proposta_assinada",
      mimeType: "application/pdf",
      aceito: null,
    });
    const fechamento = ok(await buscarFechamento(c.session, c.negocio.id));
    expect(fechamento.propostaAssinada?.id).toBe(arquivo.id);
    expect(fechamento.propostaAssinada?.url).toStartWith(
      `fake://imobiliarias/${c.imobiliaria.id}/negocios/${c.negocio.id}/`,
    );
    expect(
      [...arquivos.keys()].filter((k) => k.includes("/fechamento/")),
    ).toHaveLength(1);
    const abertas = await pendenciasDoTipo(c, "confirmar_assinatura");
    expect(abertas).toHaveLength(1);
    expect(abertas[0]?.estado).toBe("aberta");
  });

  test("registrar de novo a mesma mensagem não duplica nada", async () => {
    setSystemTime(segunda9h);
    const c = await criarCenarioDeAssinaturaDaAna();
    const primeiro = await clienteDevolveAssinada(c);
    const [a, b] = await Promise.all([
      registrarPropostaAssinada(c.session, c.negocio.id),
      registrarPropostaAssinada(c.session, c.negocio.id),
    ]);
    expect(a?.id).toBe(primeiro.id);
    expect(b?.id).toBe(primeiro.id);
    expect(
      [...arquivos.keys()].filter((k) => k.includes("/fechamento/")),
    ).toHaveLength(1);
    expect(await pendenciasDoTipo(c, "confirmar_assinatura")).toHaveLength(1);
  });

  test("o PDF assinado não vira documento da coleta", async () => {
    setSystemTime(segunda9h);
    const c = await criarCenarioDeAssinaturaDaAna();
    await clienteDevolveAssinada(c);
    const antes = ok(await buscarColeta(c.session, c.negocio.id)).documentos;

    await registrarDocumentoRecebido(c.session, c.negocio.id, "cpf");

    expect(ok(await buscarColeta(c.session, c.negocio.id)).documentos).toEqual(
      antes,
    );
  });

  test("foto não conta como proposta assinada", async () => {
    setSystemTime(segunda9h);
    const c = await criarCenarioDeAssinaturaDaAna();
    await clienteEnviaArquivo({
      instancia: c.instancia,
      idMensagem: "FOTO",
      tipo: "imagem",
      mimetype: "image/jpeg",
      nomeDoArquivo: null,
    });
    expect(await registrarPropostaAssinada(c.session, c.negocio.id)).toBeNull();
    expect(await pendenciasDoTipo(c, "confirmar_assinatura")).toHaveLength(0);
  });

  test("fora de Aguardando assinatura é recusado", async () => {
    setSystemTime(segunda9h);
    const c = await criarCenarioDeAssinaturaDaAna();
    await chegarAoPagamento(c);
    await expect(
      registrarPropostaAssinada(c.session, c.negocio.id),
    ).rejects.toBeInstanceOf(ForaDaEtapaError);
  });
});

describe("assinatura: exclusão de dados (LGPD)", () => {
  test("apagar os dados do cliente apaga a proposta assinada e os comprovantes", async () => {
    setSystemTime(segunda9h);
    const c = await criarCenarioDeAssinaturaDaAna();
    await chegarAoPagamento(c);
    await clienteMandaComprovante(c);
    ok(await apagarDadosDoCliente(c.session, c.cliente.id));
    expect(
      [...arquivos.keys()].filter((k) => k.includes("/fechamento/")),
    ).toHaveLength(0);
    const fechamento = ok(await buscarFechamento(c.session, c.negocio.id));
    expect(fechamento.propostaAssinada).toBeNull();
    expect(fechamento.comprovantes).toHaveLength(0);
  });
});

describe("assinatura: decisão do corretor", () => {
  test("confirmar leva a Aguardando pagamento e envia as instruções com a entrada", async () => {
    setSystemTime(segunda9h);
    const c = await criarCenarioDeAssinaturaDaAna();
    await clienteDevolveAssinada(c);
    enviados.length = 0;

    expect(await confirmarAssinatura(c.session, c.negocio.id)).toEqual({
      propostaId: c.proposta.id,
      estado: "assinada",
    });

    const detalhe = ok(await buscarNegocio(c.session, c.negocio.id));
    expect(detalhe.etapa).toBe("aguardando_pagamento");
    const textos = textosEnviados();
    expect(textos).toHaveLength(1);
    // Lote A-1 de R$ 85.000 no plano 60x (20% de entrada).
    expect(textos[0]).toContain("17.000,00");
    expect(textos[0]).toContain("financeiro@terranova.com.br");
    expect((await pendenciasDoTipo(c, "confirmar_assinatura"))[0]?.estado).toBe(
      "resolvida",
    );
    const fechamento = ok(await buscarFechamento(c.session, c.negocio.id));
    expect(fechamento.propostaAssinada?.aceito).toBe(true);
    expect(detalhe.conversa?.mensagens.some((m) => m.texto === textos[0])).toBe(
      true,
    );
  });

  test("confirmar de novo não reenvia nem muda nada", async () => {
    setSystemTime(segunda9h);
    const c = await criarCenarioDeAssinaturaDaAna();
    await chegarAoPagamento(c);
    const antes = ok(await buscarNegocio(c.session, c.negocio.id));
    await confirmarAssinatura(c.session, c.negocio.id);
    expect(enviados).toHaveLength(0);
    const depois = ok(await buscarNegocio(c.session, c.negocio.id));
    expect(depois.historico).toEqual(antes.historico);
  });

  test("sem instruções de pagamento na incorporadora a confirmação é bloqueada", async () => {
    setSystemTime(segunda9h);
    const c = await criarCenarioDeAssinaturaDaAna();
    await definirInstrucoesDePagamento(
      c.session,
      c.empreendimento.incorporadoraId,
      "  ",
    );
    await clienteDevolveAssinada(c);
    await expect(
      confirmarAssinatura(c.session, c.negocio.id),
    ).rejects.toBeInstanceOf(SemInstrucoesDePagamentoError);
    expect(ok(await buscarNegocio(c.session, c.negocio.id)).etapa).toBe(
      "aguardando_assinatura",
    );
  });

  test("sem PDF assinado não há o que confirmar", async () => {
    setSystemTime(segunda9h);
    const c = await criarCenarioDeAssinaturaDaAna();
    await expect(
      confirmarAssinatura(c.session, c.negocio.id),
    ).rejects.toBeInstanceOf(SemPropostaAssinadaError);
  });

  test("cliente com opt-out: nada é enviado e a proposta continua aguardando", async () => {
    setSystemTime(segunda9h);
    const c = await criarCenarioDeAssinaturaDaAna();
    await clienteDevolveAssinada(c);
    const detalhe = ok(await buscarNegocio(c.session, c.negocio.id));
    await registrarOptOut(c.session, ok(detalhe.conversa).id);
    enviados.length = 0;
    await expect(
      confirmarAssinatura(c.session, c.negocio.id),
    ).rejects.toBeInstanceOf(OptOutError);
    expect(enviados).toHaveLength(0);
    expect(
      ok(await buscarPropostaDoNegocio(c.session, c.negocio.id)).estado,
    ).toBe("enviada");
  });

  test("rejeitar pede o reenvio e o novo PDF vira a assinatura a conferir", async () => {
    setSystemTime(segunda9h);
    const c = await criarCenarioDeAssinaturaDaAna();
    const primeiro = await clienteDevolveAssinada(c);
    enviados.length = 0;

    expect(await rejeitarAssinatura(c.session, c.negocio.id)).toEqual({
      rejeitada: true,
    });
    const textos = textosEnviados();
    expect(textos).toHaveLength(1);
    expect(textos[0]).toContain("assinador.iti.br");
    expect((await pendenciasDoTipo(c, "confirmar_assinatura"))[0]?.estado).toBe(
      "resolvida",
    );
    expect(
      ok(await buscarFechamento(c.session, c.negocio.id)).propostaAssinada,
    ).toBeNull();
    expect(ok(await buscarNegocio(c.session, c.negocio.id)).etapa).toBe(
      "aguardando_assinatura",
    );

    // Rejeitar de novo não reenvia.
    expect(await rejeitarAssinatura(c.session, c.negocio.id)).toEqual({
      rejeitada: false,
    });
    expect(textosEnviados()).toHaveLength(1);

    const segundo = await clienteDevolveAssinada(c, "PDF-ASSINADO-2");
    expect(segundo.id).not.toBe(primeiro.id);
    expect(
      ok(await buscarFechamento(c.session, c.negocio.id)).propostaAssinada?.id,
    ).toBe(segundo.id);
    const pendencias = await pendenciasDoTipo(c, "confirmar_assinatura");
    expect(pendencias.map((p) => p.estado).sort()).toEqual([
      "aberta",
      "resolvida",
    ]);
  });
});

describe("assinatura: reserva", () => {
  test("com o PDF assinado à espera do corretor, a reserva não expira", async () => {
    setSystemTime(segunda9h);
    const c = await criarCenarioDeAssinaturaDaAna();
    await clienteDevolveAssinada(c);

    setSystemTime(em("2026-11-06T09:00:00"));
    expect(await expirarReservas()).toEqual({ expiradas: 0 });
    expect(ok(await buscarLote(c.session, c.lotes.disponivel.id)).status).toBe(
      "reservado",
    );
    expect(
      ok(await buscarPropostaDoNegocio(c.session, c.negocio.id)).reserva
        ?.estado,
    ).toBe("ativa");
  });

  test("com a proposta assinada (aguardando pagamento), a reserva não expira", async () => {
    setSystemTime(segunda9h);
    const c = await criarCenarioDeAssinaturaDaAna();
    await chegarAoPagamento(c);

    setSystemTime(em("2026-11-06T09:00:00"));
    expect(await expirarReservas()).toEqual({ expiradas: 0 });
    const proposta = ok(await buscarPropostaDoNegocio(c.session, c.negocio.id));
    expect(proposta.estado).toBe("assinada");
    expect(proposta.reserva?.estado).toBe("ativa");
    expect(ok(await buscarLote(c.session, c.lotes.disponivel.id)).status).toBe(
      "reservado",
    );
  });

  test("assinatura rejeitada volta a contar o prazo", async () => {
    setSystemTime(segunda9h);
    const c = await criarCenarioDeAssinaturaDaAna();
    await clienteDevolveAssinada(c);
    await rejeitarAssinatura(c.session, c.negocio.id);

    setSystemTime(em("2026-11-06T09:00:00"));
    expect(await expirarReservas()).toEqual({ expiradas: 1 });
  });
});

describe("pagamento", () => {
  test("comprovante recebido gera a pendência de confirmar pagamento", async () => {
    setSystemTime(segunda9h);
    const c = await criarCenarioDeAssinaturaDaAna();
    await chegarAoPagamento(c);
    const comprovante = await clienteMandaComprovante(c);
    expect(comprovante).toMatchObject({
      tipo: "comprovante_de_pagamento",
      mimeType: "image/jpeg",
    });
    expect(
      ok(await buscarFechamento(c.session, c.negocio.id)).comprovantes,
    ).toHaveLength(1);
    expect(await pendenciasDoTipo(c, "confirmar_pagamento")).toHaveLength(1);
    // Repetir devolve o mesmo.
    expect(
      (await registrarComprovanteDePagamento(c.session, c.negocio.id))?.id,
    ).toBe(comprovante.id);
    expect(await pendenciasDoTipo(c, "confirmar_pagamento")).toHaveLength(1);
  });

  test("comprovante fora de Aguardando pagamento é recusado", async () => {
    setSystemTime(segunda9h);
    const c = await criarCenarioDeAssinaturaDaAna();
    await expect(
      registrarComprovanteDePagamento(c.session, c.negocio.id),
    ).rejects.toBeInstanceOf(ForaDaEtapaError);
  });

  test("confirmar leva a Ganho, vende o lote e encerra a reserva", async () => {
    setSystemTime(segunda9h);
    const c = await criarCenarioDeAssinaturaDaAna();
    await chegarAoPagamento(c);
    await clienteMandaComprovante(c);

    expect(await confirmarPagamento(c.session, c.negocio.id)).toEqual({
      etapa: "ganho",
    });
    const detalhe = ok(await buscarNegocio(c.session, c.negocio.id));
    expect(detalhe.etapa).toBe("ganho");
    expect(detalhe.historico.find((h) => h.para === "ganho")).toMatchObject({
      de: "aguardando_pagamento",
      para: "ganho",
      autor: "corretor",
    });
    expect(ok(await buscarLote(c.session, c.lotes.disponivel.id)).status).toBe(
      "vendido",
    );
    expect(
      ok(await buscarPropostaDoNegocio(c.session, c.negocio.id)).reserva
        ?.estado,
    ).toBe("concluida");
    expect((await pendenciasDoTipo(c, "confirmar_pagamento"))[0]?.estado).toBe(
      "resolvida",
    );
    expect(
      ok(await buscarFechamento(c.session, c.negocio.id)).comprovantes[0]
        ?.aceito,
    ).toBe(true);

    // Passado o prazo da reserva, o job de expiração não libera o lote.
    setSystemTime(em("2026-11-06T09:00:00"));
    expect(await expirarReservas()).toEqual({ expiradas: 0 });
    expect(ok(await buscarLote(c.session, c.lotes.disponivel.id)).status).toBe(
      "vendido",
    );
  });

  test("confirmar o pagamento de novo não altera nada", async () => {
    setSystemTime(segunda9h);
    const c = await criarCenarioDeAssinaturaDaAna();
    await chegarAoPagamento(c);
    await confirmarPagamento(c.session, c.negocio.id);
    const antes = ok(await buscarNegocio(c.session, c.negocio.id));
    const repetidas = await Promise.all([
      confirmarPagamento(c.session, c.negocio.id),
      confirmarPagamento(c.session, c.negocio.id),
    ]);
    expect(repetidas).toEqual([{ etapa: "ganho" }, { etapa: "ganho" }]);
    expect(ok(await buscarNegocio(c.session, c.negocio.id)).historico).toEqual(
      antes.historico,
    );
  });

  test("confirmações simultâneas registram Ganho uma vez só", async () => {
    setSystemTime(segunda9h);
    const c = await criarCenarioDeAssinaturaDaAna();
    await chegarAoPagamento(c);
    await Promise.all([
      confirmarPagamento(c.session, c.negocio.id),
      confirmarPagamento(c.session, c.negocio.id),
    ]);
    const historico = ok(
      await buscarNegocio(c.session, c.negocio.id),
    ).historico;
    expect(historico.filter((h) => h.para === "ganho")).toHaveLength(1);
  });

  test("antes da assinatura confirmada o pagamento não pode ser confirmado", async () => {
    setSystemTime(segunda9h);
    const c = await criarCenarioDeAssinaturaDaAna();
    await expect(
      confirmarPagamento(c.session, c.negocio.id),
    ).rejects.toBeInstanceOf(ForaDaEtapaError);
    expect(ok(await buscarLote(c.session, c.lotes.disponivel.id)).status).toBe(
      "reservado",
    );
  });
});

describe("assinatura e pagamento: escopo", () => {
  test("outro corretor e outra imobiliária não veem nem agem no negócio", async () => {
    setSystemTime(segunda9h);
    const c = await criarCenarioDeAssinaturaDaAna();
    await clienteDevolveAssinada(c);
    const bruno = await criarBruno(c.imobiliaria);
    const outros = [
      sessaoDe(bruno, c.imobiliaria),
      (await criarConcorrente()).session,
    ];
    for (const session of outros) {
      expect(await buscarFechamento(session, c.negocio.id)).toBeNull();
      expect(await registrarPropostaAssinada(session, c.negocio.id)).toBeNull();
      expect(await confirmarAssinatura(session, c.negocio.id)).toBeNull();
      expect(await rejeitarAssinatura(session, c.negocio.id)).toBeNull();
      expect(
        await registrarComprovanteDePagamento(session, c.negocio.id),
      ).toBeNull();
      expect(await confirmarPagamento(session, c.negocio.id)).toBeNull();
    }
    expect(
      await definirInstrucoesDePagamento(
        outros[1] as (typeof outros)[number],
        c.empreendimento.incorporadoraId,
        "Pix de golpe",
      ),
    ).toBeNull();
    expect(await buscarFechamento(c.session, "nao-e-uuid")).toBeNull();
    expect(ok(await buscarNegocio(c.session, c.negocio.id)).etapa).toBe(
      "aguardando_assinatura",
    );
  });
});

describe("lembretes das etapas finais", () => {
  test("Aguardando assinatura: a cada 2 dias na janela, até a reserva expirar", async () => {
    setSystemTime(segunda9h);
    await criarCenarioDeAssinaturaDaAna();

    setSystemTime(em("2026-11-03T09:00:00"));
    expect(await enviarLembretesDeEtapasFinais()).toEqual({ enviados: 0 });
    setSystemTime(em("2026-11-04T07:30:00"));
    expect(await enviarLembretesDeEtapasFinais()).toEqual({ enviados: 0 });
    setSystemTime(em("2026-11-04T09:00:00"));
    expect(await enviarLembretesDeEtapasFinais()).toEqual({ enviados: 1 });
    const [lembrete] = textosEnviados();
    expect(lembrete).toContain("assinador.iti.br");
    expect(lembrete).toContain("05/11");
    setSystemTime(em("2026-11-04T15:00:00"));
    expect(await enviarLembretesDeEtapasFinais()).toEqual({ enviados: 0 });

    // Sexta seria o próximo, mas a reserva venceu na quinta às 9h.
    setSystemTime(em("2026-11-06T09:00:00"));
    expect(await enviarLembretesDeEtapasFinais()).toEqual({ enviados: 0 });
    expect(enviados).toHaveLength(1);
  });

  test("com a proposta assinada à espera do corretor não lembra o cliente", async () => {
    setSystemTime(segunda9h);
    const c = await criarCenarioDeAssinaturaDaAna();
    await clienteDevolveAssinada(c);
    enviados.length = 0;
    setSystemTime(em("2026-11-04T09:00:00"));
    expect(await enviarLembretesDeEtapasFinais()).toEqual({ enviados: 0 });
  });

  test("Aguardando pagamento: lembra a entrada; domingo não; comprovante recebido para", async () => {
    setSystemTime(segunda9h);
    const c = await criarCenarioDeAssinaturaDaAna();
    await chegarAoPagamento(c);

    // Sem reserva vencida: prorrogada até o fim do mês.
    const { prorrogarReserva } = await import("./propostas");
    const reserva = ok(
      ok(await buscarPropostaDoNegocio(c.session, c.negocio.id)).reserva,
    );
    ok(
      await prorrogarReserva(c.session, reserva.id, {
        expiraEm: em("2026-11-30T20:00:00"),
      }),
    );

    setSystemTime(em("2026-11-04T10:00:00"));
    expect(await enviarLembretesDeEtapasFinais()).toEqual({ enviados: 1 });
    expect(textosEnviados()[0]).toContain("17.000,00");

    // Domingo, 8/11: fora da janela.
    setSystemTime(em("2026-11-08T10:00:00"));
    expect(await enviarLembretesDeEtapasFinais()).toEqual({ enviados: 0 });
    // Segunda, 9/11: vence de novo.
    setSystemTime(em("2026-11-09T10:00:00"));
    await clienteMandaComprovante(c);
    enviados.length = 0;
    expect(await enviarLembretesDeEtapasFinais()).toEqual({ enviados: 0 });
  });

  for (const [caso, parar] of [
    ["com opt-out", registrarOptOut],
    ["com o assistente desligado", desligarAssistente],
  ] as const) {
    test(`conversa ${caso} não recebe lembrete`, async () => {
      setSystemTime(segunda9h);
      const c = await criarCenarioDeAssinaturaDaAna();
      const detalhe = ok(await buscarNegocio(c.session, c.negocio.id));
      await parar(c.session, ok(detalhe.conversa).id);
      enviados.length = 0;
      setSystemTime(em("2026-11-04T09:00:00"));
      expect(await enviarLembretesDeEtapasFinais()).toEqual({ enviados: 0 });
    });
  }
});
