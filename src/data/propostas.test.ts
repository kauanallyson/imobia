import { describe, expect, setSystemTime, test } from "bun:test";
import { gerados } from "@/test/fakes/documentos";
import { arquivos } from "@/test/fakes/storage";
import {
  aoEnviarEcoar,
  avisosDoSistema,
  enviados,
} from "@/test/fakes/whatsapp";
import {
  criarBruno,
  criarCenarioDePropostaDaAna,
  criarConcorrente,
  criarDocx,
  darTelefoneAAna,
  ok,
  outroClienteFechaOLote,
  sessaoDe,
} from "@/test/fixtures";
import { OptOutError } from "./assistente/contexto";
import { LoteIndisponivelError } from "./coleta-de-dados";
import { receberMensagem } from "./conversas";
import { registrarOptOut } from "./estado-do-assistente";
import { alterarStatusDoLote, buscarLote } from "./lotes";
import { buscarNegocio, mudarEtapa } from "./negocios";
import { listarPendencias } from "./pendencias";
import {
  aprovarProposta,
  buscarModeloDeProposta,
  buscarPropostaDoNegocio,
  ColetaIncompletaError,
  enviarModeloDeProposta,
  expirarReservas,
  gerarProposta,
  ModeloDePropostaInvalidoError,
  PrazoDaReservaInvalidoError,
  prorrogarReserva,
  SemModeloDePropostaError,
} from "./propostas";

// Segunda, 2/11/2026, 21h (fora da janela de avisos: só urgentes saem).
const segunda21h = new Date("2026-11-02T21:00:00-03:00");
const HORA = 60 * 60 * 1000;

describe("propostas: modelo da incorporadora", () => {
  test("corretor envia o DOCX e vê os campos reconhecidos e desconhecidos", async () => {
    setSystemTime(segunda21h);
    const { session, empreendimento } = await criarCenarioDePropostaDaAna(
      criarDocx(["{cliente_nome} {lote_numero} {campo_inventado}"]),
    );
    const modelo = ok(
      await buscarModeloDeProposta(session, empreendimento.incorporadoraId),
    );
    expect(modelo).toMatchObject({
      nomeDoArquivo: "modelo.docx",
      campos: ["cliente_nome", "lote_numero", "campo_inventado"],
      desconhecidos: ["campo_inventado"],
    });
    expect(modelo.url).toStartWith("fake://imobiliarias/");
  });

  test("enviar outro modelo substitui o anterior e apaga o arquivo antigo", async () => {
    const { session, empreendimento } = await criarCenarioDePropostaDaAna();
    const antes = [...arquivos.keys()].filter((k) =>
      k.includes("modelo-de-proposta"),
    );
    expect(antes).toHaveLength(1);
    ok(
      await enviarModeloDeProposta(session, {
        incorporadoraId: empreendimento.incorporadoraId,
        nomeDoArquivo: "novo.docx",
        conteudo: criarDocx(["{data}"]),
      }),
    );
    const depois = [...arquivos.keys()].filter((k) =>
      k.includes("modelo-de-proposta"),
    );
    expect(depois).toHaveLength(1);
    expect(depois[0]).not.toBe(antes[0]);
    expect(
      ok(await buscarModeloDeProposta(session, empreendimento.incorporadoraId))
        .nomeDoArquivo,
    ).toBe("novo.docx");
  });

  test("arquivo que não é DOCX é recusado", async () => {
    const { session, empreendimento } = await criarCenarioDePropostaDaAna();
    await expect(
      enviarModeloDeProposta(session, {
        incorporadoraId: empreendimento.incorporadoraId,
        nomeDoArquivo: "x.pdf",
        conteudo: new TextEncoder().encode("%PDF-1.4"),
      }),
    ).rejects.toBeInstanceOf(ModeloDePropostaInvalidoError);
  });

  test("outra imobiliária não vê nem substitui o modelo", async () => {
    const { empreendimento } = await criarCenarioDePropostaDaAna();
    const outra = await criarConcorrente();
    expect(
      await buscarModeloDeProposta(
        outra.session,
        empreendimento.incorporadoraId,
      ),
    ).toBeNull();
    expect(
      await enviarModeloDeProposta(outra.session, {
        incorporadoraId: empreendimento.incorporadoraId,
        nomeDoArquivo: "x.docx",
        conteudo: criarDocx(["x"]),
      }),
    ).toBeNull();
  });
});

describe("propostas: geração", () => {
  test("preenche o modelo com os dados do negócio e gera o PDF", async () => {
    setSystemTime(segunda21h);
    const { session, negocio } = await criarCenarioDePropostaDaAna();
    const proposta = ok(await gerarProposta(session, negocio.id));

    expect(proposta.estado).toBe("em_revisao");
    expect(gerados).toHaveLength(1);
    // R$ 85.000 no plano 60x com 20% de entrada (calcularPlano).
    expect(gerados[0]?.campos).toMatchObject({
      cliente_nome: "Carlos Lima",
      cliente_cpf: "123.456.789-09",
      empreendimento: "Jardim das Flores",
      lote_quadra: "A",
      lote_numero: "1",
      modelo_de_casa: "Somente o lote",
      plano: "60x",
      preco_total: "R$ 85.000,00",
      entrada: "R$ 17.000,00",
      parcela: "R$ 1.133,34",
      parcelas: "60",
      dia_pagamento: "10",
      primeira_parcela: "10/11/2026",
      forma_pagamento: "Pix",
      data: "02/11/2026",
    });
    expect(gerados[0]?.texto).toBe(
      "Proposta para Carlos Lima, CPF 123.456.789-09" +
        "Jardim das Flores: quadra A, lote 1" +
        "60x: entrada de R$ 17.000,00 + 60x de R$ 1.133,34",
    );
    const doNegocio = ok(await buscarPropostaDoNegocio(session, negocio.id));
    expect(doNegocio.id).toBe(proposta.id);
    expect(doNegocio.urlPdf).toStartWith("fake://");
    const chave = ok(doNegocio.urlPdf.match(/^fake:\/\/([^?]+)/)?.[1]);
    expect(arquivos.get(chave)?.contentType).toBe("application/pdf");
  });

  test("leva o negócio a Proposta em revisão e cria a pendência urgente", async () => {
    setSystemTime(segunda21h);
    const { session, negocio, corretor } = await criarCenarioDePropostaDaAna();
    await darTelefoneAAna(corretor);
    await gerarProposta(session, negocio.id);

    expect(ok(await buscarNegocio(session, negocio.id)).etapa).toBe(
      "proposta_em_revisao",
    );
    const pendencias = await listarPendencias(session);
    expect(pendencias).toHaveLength(1);
    expect(pendencias[0]).toMatchObject({
      tipo: "revisar_proposta",
      estado: "aberta",
      negocioId: negocio.id,
    });
    // Urgente: avisa às 21h.
    expect(avisosDoSistema).toHaveLength(1);
  });

  test("gerar de novo (ou em paralelo) devolve a mesma proposta", async () => {
    const { session, negocio } = await criarCenarioDePropostaDaAna();
    const [a, b] = await Promise.all([
      gerarProposta(session, negocio.id),
      gerarProposta(session, negocio.id),
    ]);
    const c = await gerarProposta(session, negocio.id);
    expect(ok(a).id).toBe(ok(b).id);
    expect(ok(c).id).toBe(ok(a).id);
    expect(gerados).toHaveLength(1);
    expect(await listarPendencias(session)).toHaveLength(1);
  });

  test("lote reservado ou vendido não entra em nova proposta", async () => {
    for (const status of ["reservado", "vendido"] as const) {
      const { session, negocio, lotes } = await criarCenarioDePropostaDaAna();
      await alterarStatusDoLote(session, lotes.disponivel.id, status);
      await expect(gerarProposta(session, negocio.id)).rejects.toBeInstanceOf(
        LoteIndisponivelError,
      );
      expect(gerados).toHaveLength(0);
      const { db } = await import("@/lib/db");
      await db.execute("truncate table imobiliarias cascade");
    }
  });

  test("coleta incompleta não gera proposta", async () => {
    const { session, negocio } = await criarCenarioDePropostaDaAna();
    const { db } = await import("@/lib/db");
    const { negocios } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    await db
      .update(negocios)
      .set({ planoEscolhidoId: null })
      .where(eq(negocios.id, negocio.id));
    const erro = await gerarProposta(session, negocio.id).catch((e) => e);
    expect(erro).toBeInstanceOf(ColetaIncompletaError);
    expect(erro.faltando).toEqual(["plano"]);
  });

  test("sem modelo de proposta da incorporadora não gera", async () => {
    const { session, negocio, empreendimento } =
      await criarCenarioDePropostaDaAna();
    const { db } = await import("@/lib/db");
    const { modelosDeProposta } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    await db
      .delete(modelosDeProposta)
      .where(
        eq(modelosDeProposta.incorporadoraId, empreendimento.incorporadoraId),
      );
    await expect(gerarProposta(session, negocio.id)).rejects.toBeInstanceOf(
      SemModeloDePropostaError,
    );
  });

  test("outro corretor não gera nem vê a proposta do negócio da Ana", async () => {
    const { session, negocio, imobiliaria } =
      await criarCenarioDePropostaDaAna();
    await gerarProposta(session, negocio.id);
    const bruno = sessaoDe(await criarBruno(imobiliaria), imobiliaria);
    expect(await gerarProposta(bruno, negocio.id)).toBeNull();
    expect(await buscarPropostaDoNegocio(bruno, negocio.id)).toBeNull();
  });
});

describe("propostas: aprovação e reserva", () => {
  test("aprovar envia o PDF com instruções do gov.br, reserva 72h e leva a Aguardando assinatura", async () => {
    setSystemTime(segunda21h);
    const { session, negocio, lotes } = await criarCenarioDePropostaDaAna();
    const proposta = ok(await gerarProposta(session, negocio.id));
    const aprovada = ok(await aprovarProposta(session, proposta.id));

    expect(aprovada.estado).toBe("enviada");
    expect(enviados).toHaveLength(2);
    expect(enviados[0]).toMatchObject({ tipo: "midia", para: "5588999990000" });
    expect(enviados[1]).toMatchObject({ tipo: "texto" });
    if (enviados[1]?.tipo !== "texto") throw new Error("esperava texto");
    expect(enviados[1].texto).toContain("gov.br");
    expect(enviados[1].texto).toContain("05/11/2026");

    const doNegocio = ok(await buscarPropostaDoNegocio(session, negocio.id));
    expect(doNegocio.reserva).toMatchObject({
      estado: "ativa",
      expiraEm: new Date(segunda21h.getTime() + 72 * HORA),
    });
    expect(ok(await buscarLote(session, lotes.disponivel.id)).status).toBe(
      "reservado",
    );
    const detalhe = ok(await buscarNegocio(session, negocio.id));
    expect(detalhe.etapa).toBe("aguardando_assinatura");
    // A pendência de revisão fica resolvida.
    expect((await listarPendencias(session))[0]?.estado).toBe("resolvida");
    // O envio fica na conversa como mensagem do assistente.
    expect(
      detalhe.conversa?.mensagens.filter((m) => m.autor === "assistente")
        .length,
    ).toBeGreaterThanOrEqual(2);
  });

  test("o eco do PDF e das instruções durante a aprovação não pausa o assistente", async () => {
    setSystemTime(segunda21h);
    const { session, negocio } = await criarCenarioDePropostaDaAna();
    const proposta = ok(await gerarProposta(session, negocio.id));
    aoEnviarEcoar(receberMensagem);

    ok(await aprovarProposta(session, proposta.id));

    const conversa = ok((await buscarNegocio(session, negocio.id))?.conversa);
    expect(conversa.assistente).toBe("ativo");
    expect(conversa.mensagens.filter((m) => m.autor === "corretor")).toEqual(
      [],
    );
  });

  test("aprovar duas vezes envia e reserva uma única vez", async () => {
    const { session, negocio } = await criarCenarioDePropostaDaAna();
    const proposta = ok(await gerarProposta(session, negocio.id));
    await Promise.all([
      aprovarProposta(session, proposta.id),
      aprovarProposta(session, proposta.id),
    ]);
    await aprovarProposta(session, proposta.id);
    expect(enviados).toHaveLength(2);
    const { db } = await import("@/lib/db");
    const { reservas } = await import("@/lib/db/schema");
    expect(await db.select().from(reservas)).toHaveLength(1);
  });

  test("duas propostas do mesmo lote aprovadas em paralelo: só uma reserva vence", async () => {
    const cenario = await criarCenarioDePropostaDaAna();
    const { session } = cenario;
    const outroNegocio = await outroClienteFechaOLote(cenario);
    const p1 = ok(await gerarProposta(session, cenario.negocio.id));
    const p2 = ok(await gerarProposta(session, outroNegocio.id));

    const resultados = await Promise.allSettled([
      aprovarProposta(session, p1.id),
      aprovarProposta(session, p2.id),
    ]);
    const vencedoras = resultados.filter((r) => r.status === "fulfilled");
    const perdedoras = resultados.filter((r) => r.status === "rejected");
    expect(vencedoras).toHaveLength(1);
    expect(perdedoras).toHaveLength(1);
    expect(perdedoras[0]?.reason).toBeInstanceOf(LoteIndisponivelError);
    const { db } = await import("@/lib/db");
    const { reservas } = await import("@/lib/db/schema");
    expect(await db.select().from(reservas)).toHaveLength(1);
    // Só o vencedor recebeu o PDF.
    expect(enviados.filter((e) => e.tipo === "midia")).toHaveLength(1);
  });

  test("cliente com opt-out: a aprovação é recusada e nada é reservado", async () => {
    const { session, negocio, lotes, conversaId } = await (async () => {
      const c = await criarCenarioDePropostaDaAna();
      const n = ok(await buscarNegocio(c.session, c.negocio.id));
      return { ...c, conversaId: ok(n.conversa).id };
    })();
    const proposta = ok(await gerarProposta(session, negocio.id));
    await registrarOptOut(session, conversaId);
    await expect(aprovarProposta(session, proposta.id)).rejects.toBeInstanceOf(
      OptOutError,
    );
    expect(enviados).toHaveLength(0);
    expect(ok(await buscarLote(session, lotes.disponivel.id)).status).toBe(
      "disponivel",
    );
  });

  test("outro corretor não aprova a proposta da Ana", async () => {
    const { session, negocio, imobiliaria } =
      await criarCenarioDePropostaDaAna();
    const proposta = ok(await gerarProposta(session, negocio.id));
    const bruno = sessaoDe(await criarBruno(imobiliaria), imobiliaria);
    expect(await aprovarProposta(bruno, proposta.id)).toBeNull();
    expect(enviados).toHaveLength(0);
  });
});

describe("propostas: prorrogação e expiração", () => {
  async function propostaEnviada() {
    setSystemTime(segunda21h);
    const cenario = await criarCenarioDePropostaDaAna();
    const proposta = ok(
      await gerarProposta(cenario.session, cenario.negocio.id),
    );
    await aprovarProposta(cenario.session, proposta.id);
    const reserva = ok(
      ok(await buscarPropostaDoNegocio(cenario.session, cenario.negocio.id))
        .reserva,
    );
    return { ...cenario, proposta, reserva };
  }

  test("prorrogar soma horas ou define a nova expiração", async () => {
    const { session, reserva } = await propostaEnviada();
    const somada = ok(
      await prorrogarReserva(session, reserva.id, { horas: 24 }),
    );
    expect(somada.expiraEm).toEqual(new Date(segunda21h.getTime() + 96 * HORA));
    const nova = new Date("2026-11-10T18:00:00-03:00");
    expect(
      ok(await prorrogarReserva(session, reserva.id, { expiraEm: nova }))
        .expiraEm,
    ).toEqual(nova);
  });

  test("nova expiração no passado é recusada", async () => {
    const { session, reserva } = await propostaEnviada();
    await expect(
      prorrogarReserva(session, reserva.id, {
        expiraEm: new Date(segunda21h.getTime() - HORA),
      }),
    ).rejects.toBeInstanceOf(PrazoDaReservaInvalidoError);
  });

  test("outra imobiliária não prorroga", async () => {
    const { reserva } = await propostaEnviada();
    const outra = await criarConcorrente();
    expect(
      await prorrogarReserva(outra.session, reserva.id, { horas: 24 }),
    ).toBeNull();
  });

  test("reserva expirada libera o lote uma vez; o negócio fica onde está", async () => {
    const { session, negocio, lotes, reserva } = await propostaEnviada();
    setSystemTime(new Date(segunda21h.getTime() + 71 * HORA));
    expect(await expirarReservas()).toEqual({ expiradas: 0 });

    setSystemTime(new Date(segunda21h.getTime() + 72 * HORA));
    expect(await expirarReservas()).toEqual({ expiradas: 1 });
    expect(await expirarReservas()).toEqual({ expiradas: 0 });

    expect(ok(await buscarLote(session, lotes.disponivel.id)).status).toBe(
      "disponivel",
    );
    const proposta = ok(await buscarPropostaDoNegocio(session, negocio.id));
    expect(proposta.estado).toBe("expirada");
    expect(proposta.reserva?.estado).toBe("expirada");
    expect(proposta.reserva?.id).toBe(reserva.id);
    expect(ok(await buscarNegocio(session, negocio.id)).etapa).toBe(
      "aguardando_assinatura",
    );
    // Expirada, a reserva não se prorroga mais.
    await expect(
      prorrogarReserva(session, reserva.id, { horas: 24 }),
    ).rejects.toBeInstanceOf(PrazoDaReservaInvalidoError);
  });

  test("reserva prorrogada não expira no prazo original", async () => {
    const { session, lotes, reserva } = await propostaEnviada();
    await prorrogarReserva(session, reserva.id, { horas: 24 });
    setSystemTime(new Date(segunda21h.getTime() + 80 * HORA));
    expect(await expirarReservas()).toEqual({ expiradas: 0 });
    expect(ok(await buscarLote(session, lotes.disponivel.id)).status).toBe(
      "reservado",
    );
  });

  test("depois de expirada, o negócio pode ter nova proposta", async () => {
    const { session, negocio, proposta } = await propostaEnviada();
    setSystemTime(new Date(segunda21h.getTime() + 73 * HORA));
    await expirarReservas();
    await mudarEtapa(session, negocio.id, "coletando_dados");
    const nova = ok(await gerarProposta(session, negocio.id));
    expect(nova.id).not.toBe(proposta.id);
    expect(nova.estado).toBe("em_revisao");
  });
});
