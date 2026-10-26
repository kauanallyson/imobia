import { describe, expect, setSystemTime, test } from "bun:test";
import { pedidos, roteirizar } from "@/test/fakes/llm";
import {
  avisosDoSistema,
  enviados,
  mensagemRecebida,
} from "@/test/fakes/whatsapp";
import {
  criarConcorrente,
  darTelefoneAAna,
  iniciarConversaDaAna,
} from "@/test/fixtures";
import {
  desligarAssistente,
  listarMensagens,
  receberMensagem,
  registrarOptOut,
} from "./conversas";
import { enviarFollowUps, listarNegociosSilenciosos } from "./follow-ups";
import { buscarNegocio, listarNegocios, mudarEtapa } from "./negocios";

const br = (s: string) => new Date(`${s}-03:00`);
const DIA = 24 * 60 * 60 * 1000;

// A conversa começa com o relógio fixo: a mensagem do cliente "Oi, vi o
// anúncio" chega em `inicio` e o negócio vai a Em atendimento.
async function conversaIniciadaEm(inicio: Date) {
  setSystemTime(inicio);
  const cenario = await iniciarConversaDaAna();
  const [negocio] = await listarNegocios(cenario.session);
  if (!negocio) throw new Error("sem negócio");
  return { ...cenario, negocio };
}

async function rodarEm(instante: Date, ...textos: string[]) {
  setSystemTime(instante);
  for (const texto of textos) roteirizar({ tipo: "texto", texto });
  return enviarFollowUps();
}

// Terça, 3/11/2026, 10:00 em Brasília.
const terca10h = br("2026-11-03T10:00:00");

describe("follow-up automático", () => {
  test("segue a cadência 1d, 3d, 7d e depois a cada 2 semanas, com texto do assistente", async () => {
    const { session, conversaId, telefone, instancia } =
      await conversaIniciadaEm(terca10h);

    expect(await rodarEm(new Date(terca10h.getTime() + DIA - 60_000))).toEqual({
      clientes: 0,
      corretores: 0,
    });
    expect(enviados).toEqual([]);

    expect(
      await rodarEm(br("2026-11-04T10:00:00"), "Oi! Ainda tem interesse?"),
    ).toEqual({ clientes: 1, corretores: 0 });
    expect(enviados).toEqual([
      {
        instancia,
        para: telefone,
        tipo: "texto",
        texto: "Oi! Ainda tem interesse?",
      },
    ]);
    // O modelo recebe a conversa e a instrução de follow-up, sem ferramentas.
    const [pedido] = pedidos;
    expect(pedido?.historico[0]).toEqual({
      papel: "usuario",
      texto: "Oi, vi o anúncio",
    });
    expect(pedido?.instrucoes).toContain("follow-up");
    expect(pedido?.ferramentas).toEqual([]);
    const mensagens = await listarMensagens(session, conversaId);
    expect(mensagens.at(-1)).toMatchObject({
      autor: "assistente",
      texto: "Oi! Ainda tem interesse?",
    });

    for (const [quando, texto] of [
      ["2026-11-06T10:00:00", "passo 2"], // +3d
      ["2026-11-10T10:00:00", "passo 3"], // +7d
      ["2026-11-24T10:00:00", "passo 4"], // +21d
      ["2026-12-08T10:00:00", "passo 5"], // +35d
    ] as const) {
      // Um minuto antes, nada.
      expect(
        (await rodarEm(new Date(br(quando).getTime() - 60_000))).clientes,
      ).toBe(0);
      expect((await rodarEm(br(quando), texto)).clientes).toBe(1);
    }
    expect(enviados.map((e) => (e.tipo === "texto" ? e.texto : ""))).toEqual([
      "Oi! Ainda tem interesse?",
      "passo 2",
      "passo 3",
      "passo 4",
      "passo 5",
    ]);
  });

  test("cada passo sai uma única vez, mesmo rodando o job de novo", async () => {
    await conversaIniciadaEm(terca10h);
    await rodarEm(br("2026-11-04T10:00:00"), "Oi!");
    // Sem roteiro: se o job chamasse o modelo de novo, o falso lançaria.
    expect(await rodarEm(br("2026-11-04T10:01:00"))).toEqual({
      clientes: 0,
      corretores: 0,
    });
    expect(await rodarEm(br("2026-11-05T19:00:00"))).toEqual({
      clientes: 0,
      corretores: 0,
    });
    expect(enviados).toHaveLength(1);
  });

  test("rodadas simultâneas não mandam o mesmo passo duas vezes", async () => {
    await conversaIniciadaEm(terca10h);
    setSystemTime(br("2026-11-04T10:00:00"));
    roteirizar(
      { tipo: "texto", texto: "Oi!" },
      { tipo: "texto", texto: "Oi!" },
    );
    await Promise.all([enviarFollowUps(), enviarFollowUps()]);
    expect(enviados).toHaveLength(1);
  });

  test("falha ao gerar o texto não consome o passo: sai na próxima rodada", async () => {
    await conversaIniciadaEm(terca10h);
    // Roteiro vazio: o modelo falso lança.
    expect((await rodarEm(br("2026-11-04T10:00:00"))).clientes).toBe(0);
    expect((await rodarEm(br("2026-11-04T10:01:00"), "Oi!")).clientes).toBe(1);
    expect(enviados).toHaveLength(1);
  });

  test("a resposta do cliente reinicia a contagem", async () => {
    const { instancia, telefone } = await conversaIniciadaEm(terca10h);
    await rodarEm(br("2026-11-04T10:00:00"), "Oi, tudo bem?");

    // Quinta 9h o cliente responde (e o assistente atende).
    setSystemTime(br("2026-11-05T09:00:00"));
    roteirizar({ tipo: "texto", texto: "Que bom!" });
    await receberMensagem(
      mensagemRecebida({ instancia, telefone, texto: "Sim, ainda quero" }),
    );
    enviados.length = 0;

    // Sexta 8h59: 1 dia depois da resposta ainda não chegou.
    expect((await rodarEm(br("2026-11-06T08:59:00"))).clientes).toBe(0);
    // O passo 2 da contagem antiga (sexta 10h) não sai; o passo 1 da nova
    // (sexta 9h) sai.
    expect((await rodarEm(br("2026-11-06T09:00:00"), "Novo 1")).clientes).toBe(
      1,
    );
    expect((await rodarEm(br("2026-11-06T10:00:00"))).clientes).toBe(0);
    // Passo 2 da nova contagem: +3d, domingo 8/11 9h → segunda 8h.
    expect((await rodarEm(br("2026-11-08T09:00:00"))).clientes).toBe(0);
    expect((await rodarEm(br("2026-11-09T08:00:00"), "Novo 2")).clientes).toBe(
      1,
    );
    expect(enviados.map((e) => (e.tipo === "texto" ? e.texto : ""))).toEqual([
      "Novo 1",
      "Novo 2",
    ]);
  });

  test("nada sai fora de 8h–20h nem no domingo; o envio vai para a próxima janela", async () => {
    // Sexta, 6/11, 21:00: +1d é sábado 21:00.
    await conversaIniciadaEm(br("2026-11-06T21:00:00"));
    expect((await rodarEm(br("2026-11-07T21:00:00"))).clientes).toBe(0);
    expect((await rodarEm(br("2026-11-08T10:00:00"))).clientes).toBe(0);
    expect((await rodarEm(br("2026-11-09T07:59:00"))).clientes).toBe(0);
    expect(
      (await rodarEm(br("2026-11-09T08:00:00"), "Bom dia!")).clientes,
    ).toBe(1);
  });

  test("depois de 90 dias de silêncio os envios param, o negócio fica silencioso e continua aberto", async () => {
    const { session, negocio } = await conversaIniciadaEm(terca10h);
    // Último passo: +77d (terça, 19/1/2027).
    expect(
      (await rodarEm(br("2027-01-19T10:00:00"), "Último contato")).clientes,
    ).toBe(1);
    expect(await listarNegociosSilenciosos(session)).toEqual([]);

    // +90d: segunda, 1/2/2027, 10:00.
    setSystemTime(br("2027-02-01T09:59:00"));
    expect(await listarNegociosSilenciosos(session)).toEqual([]);
    expect((await rodarEm(br("2027-02-01T10:00:00"))).clientes).toBe(0);
    expect((await rodarEm(br("2027-03-01T10:00:00"))).clientes).toBe(0);
    expect(enviados).toHaveLength(1);

    const silenciosos = await listarNegociosSilenciosos(session);
    expect(silenciosos).toEqual([
      expect.objectContaining({
        id: negocio.id,
        clienteNome: "5588999990000",
        etapa: "em_atendimento",
        ultimaMensagemDoClienteEm: terca10h,
      }),
    ]);
    expect((await buscarNegocio(session, negocio.id))?.etapa).toBe(
      "em_atendimento",
    );
  });

  test("conversa pausada pelo corretor não recebe follow-up; o corretor é lembrado uma vez por passo", async () => {
    const { corretor, instancia, telefone } =
      await conversaIniciadaEm(terca10h);
    await darTelefoneAAna(corretor, "5588988880000");
    // O corretor responde pelo celular às 10:30: o assistente pausa.
    setSystemTime(br("2026-11-03T10:30:00"));
    await receberMensagem(
      mensagemRecebida({ instancia, telefone, fromMe: true, texto: "Oi!" }),
    );

    expect(await rodarEm(br("2026-11-04T10:00:00"))).toEqual({
      clientes: 0,
      corretores: 1,
    });
    expect(await rodarEm(br("2026-11-04T10:05:00"))).toEqual({
      clientes: 0,
      corretores: 0,
    });
    expect(enviados).toEqual([]);
    expect(avisosDoSistema).toHaveLength(1);
    expect(avisosDoSistema[0]?.para).toBe("5588988880000");
    expect(avisosDoSistema[0]?.texto).toContain("Follow-up");
    expect(pedidos).toEqual([]);

    expect((await rodarEm(br("2026-11-06T10:00:00"))).corretores).toBe(1);
    expect(avisosDoSistema).toHaveLength(2);
  });

  test("opt-out nunca recebem follow-up", async () => {
    const optOut = await conversaIniciadaEm(terca10h);
    await registrarOptOut(optOut.session, optOut.conversaId);

    expect(await rodarEm(br("2026-11-04T10:00:00"))).toEqual({
      clientes: 0,
      corretores: 0,
    });
    expect(enviados).toEqual([]);
    expect(avisosDoSistema).toEqual([]);
  });

  test("assistente desligado não recebe follow-up", async () => {
    const { session, conversaId } = await conversaIniciadaEm(terca10h);
    await desligarAssistente(session, conversaId);
    expect((await rodarEm(br("2026-11-04T10:00:00"))).clientes).toBe(0);
    expect(enviados).toEqual([]);
  });

  test("só negócios em atendimento (Em atendimento, Visita agendada) recebem follow-up", async () => {
    const { session, negocio } = await conversaIniciadaEm(terca10h);
    await mudarEtapa(session, negocio.id, "visita_agendada");
    expect((await rodarEm(br("2026-11-04T10:00:00"), "Oi!")).clientes).toBe(1);

    await mudarEtapa(session, negocio.id, "coletando_dados");
    expect((await rodarEm(br("2026-11-06T10:00:00"))).clientes).toBe(0);
    expect(enviados).toHaveLength(1);
  });

  test("silenciosos são só do corretor da sessão", async () => {
    await conversaIniciadaEm(terca10h);
    const { session: outra } = await criarConcorrente();
    setSystemTime(br("2027-03-01T10:00:00"));
    expect(await listarNegociosSilenciosos(outra)).toEqual([]);
  });
});
