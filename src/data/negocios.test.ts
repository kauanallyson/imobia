import { describe, expect, setSystemTime, test } from "bun:test";
import { mensagemRecebida } from "@/test/fakes/whatsapp";
import {
  administrador,
  conectarWhatsappDaAna,
  criarAna,
  criarEmpreendimentoDaAna,
  criarNegocioDaAna,
  ok,
  sessaoDe,
} from "@/test/fixtures";
import { criarCliente, TelefoneDuplicadoError } from "./clientes";
import { receberMensagem } from "./conversas";
import { criarLote } from "./lotes";
import {
  buscarNegocio,
  criarNegocio,
  EtapaInvalidaError,
  listarNegociosPorEtapa,
  MotivoObrigatorioError,
  marcarPerdido,
  mudarEtapa,
  reabrir,
} from "./negocios";
import { ForbiddenError } from "./session";

async function negocioOuFalha(
  session: Parameters<typeof buscarNegocio>[0],
  id: string,
) {
  const negocio = await buscarNegocio(session, id);
  if (!negocio) throw new Error("negócio não encontrado");
  return negocio;
}

describe("quadro por etapa", () => {
  test("agrupa os negócios do corretor pelas etapas fixas, com o cliente", async () => {
    const { session, cliente, negocio } = await criarNegocioDaAna();
    const segundo = await criarNegocio(session, { clienteId: cliente.id });
    if (!segundo) throw new Error("segundo negócio não criado");
    await mudarEtapa(session, segundo.id, "visita_agendada");

    const quadro = await listarNegociosPorEtapa(session);

    expect(Object.keys(quadro)).toEqual([
      "novo",
      "em_atendimento",
      "visita_agendada",
      "coletando_dados",
      "proposta_em_revisao",
      "aguardando_assinatura",
      "aguardando_pagamento",
      "ganho",
      "perdido",
    ]);
    expect(quadro.novo).toEqual([
      expect.objectContaining({
        id: negocio.id,
        clienteNome: "Carlos Lima",
        clienteTelefone: "5588999990000",
      }),
    ]);
    expect(quadro.visita_agendada.map((n) => n.id)).toEqual([segundo.id]);
    expect(quadro.ganho).toEqual([]);
  });

  test("corretor não vê negócios de outro corretor, nem de outra imobiliária", async () => {
    const { imobiliaria, negocio } = await criarNegocioDaAna();
    const colega = sessaoDe({ id: crypto.randomUUID() }, imobiliaria);
    const outra = sessaoDe(
      { id: crypto.randomUUID() },
      { id: crypto.randomUUID() },
    );

    expect(await listarNegociosPorEtapa(colega)).toMatchObject({ novo: [] });
    expect(await buscarNegocio(colega, negocio.id)).toBeNull();
    expect(await buscarNegocio(outra, negocio.id)).toBeNull();
    expect(await mudarEtapa(colega, negocio.id, "ganho")).toBeNull();
    expect(await marcarPerdido(colega, negocio.id, "sumiu")).toBeNull();
    expect(await reabrir(colega, negocio.id)).toBeNull();
    expect(await buscarNegocio(colega, "nao-e-uuid")).toBeNull();
    expect(listarNegociosPorEtapa(administrador)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});

describe("detalhe do negócio", () => {
  test("traz cliente, conversa com transcrições, lote de interesse e histórico", async () => {
    const { session, instancia } = await conectarWhatsappDaAna();
    setSystemTime(new Date("2026-10-23T10:00:00-03:00"));
    const recebida = await receberMensagem(
      mensagemRecebida({
        instancia,
        telefone: "5588999990000",
        nomeDoContato: "Carlos",
        texto: "Oi, vi o anúncio",
        enviadaEm: new Date("2026-10-23T09:59:00-03:00"),
      }),
    );
    if (!recebida) throw new Error("mensagem ignorada");
    const [negocioEmNovo] = (await listarNegociosPorEtapa(session)).novo;
    setSystemTime(new Date("2026-10-23T11:00:00-03:00"));
    await mudarEtapa(session, negocioEmNovo.id, "em_atendimento", {
      autor: "assistente",
    });

    const negocio = await negocioOuFalha(session, negocioEmNovo.id);

    expect(negocio).toMatchObject({
      etapa: "em_atendimento",
      motivoPerda: null,
      loteInteresseId: null,
      cliente: { nome: "Carlos", telefone: "5588999990000", email: null },
    });
    expect(negocio.conversa?.id).toBe(recebida.conversaId);
    expect(negocio.conversa?.mensagens).toEqual([
      expect.objectContaining({
        autor: "cliente",
        texto: "Oi, vi o anúncio",
        transcricao: null,
      }),
    ]);
    expect(negocio.historico).toEqual([
      {
        de: null,
        para: "novo",
        autor: "sistema",
        em: new Date("2026-10-23T10:00:00-03:00"),
      },
      {
        de: "novo",
        para: "em_atendimento",
        autor: "assistente",
        em: new Date("2026-10-23T11:00:00-03:00"),
      },
    ]);
  });

  test("lote de interesse vem com quadra, número e empreendimento", async () => {
    const { session, cliente } = await criarNegocioDaAna();
    const { empreendimento } = await criarEmpreendimentoDaAna(session);
    const lote = ok(
      await criarLote(session, {
        empreendimentoId: empreendimento.id,
        quadra: "B",
        numero: "12",
        area: 300,
        frente: 12,
        fundo: 25,
        preco: 90000,
      }),
    );

    const negocio = ok(
      await criarNegocio(session, {
        clienteId: cliente.id,
        loteInteresseId: lote.id,
      }),
    );

    expect((await negocioOuFalha(session, negocio.id)).lote).toEqual({
      id: lote.id,
      quadra: "B",
      numero: "12",
      status: "disponivel",
      empreendimentoId: empreendimento.id,
      empreendimentoNome: "Jardim das Flores",
    });
  });

  test("negócio cadastrado à mão não tem conversa", async () => {
    const { session, negocio } = await criarNegocioDaAna();
    expect((await negocioOuFalha(session, negocio.id)).conversa).toBeNull();
  });
});

describe("mudança de etapa", () => {
  test("mudança manual fica no histórico com autor corretor e atualiza o negócio", async () => {
    const { session, negocio } = await criarNegocioDaAna();
    setSystemTime(new Date("2026-10-24T09:00:00-03:00"));

    const alterado = await mudarEtapa(session, negocio.id, "coletando_dados");

    expect(alterado).toMatchObject({
      etapa: "coletando_dados",
      atualizadoEm: new Date("2026-10-24T09:00:00-03:00"),
    });
    const { historico } = await negocioOuFalha(session, negocio.id);
    expect(historico.at(-1)).toEqual({
      de: "novo",
      para: "coletando_dados",
      autor: "corretor",
      em: new Date("2026-10-24T09:00:00-03:00"),
    });
  });

  test("mudar para a etapa em que já está não gera entrada nova no histórico", async () => {
    const { session, negocio } = await criarNegocioDaAna();
    await mudarEtapa(session, negocio.id, "visita_agendada");

    await mudarEtapa(session, negocio.id, "visita_agendada");
    await Promise.all([
      mudarEtapa(session, negocio.id, "visita_agendada"),
      mudarEtapa(session, negocio.id, "visita_agendada"),
    ]);

    const { historico } = await negocioOuFalha(session, negocio.id);
    expect(historico).toHaveLength(2);
  });

  test("Perdido só pela função própria, que exige motivo", async () => {
    const { session, negocio } = await criarNegocioDaAna();

    // O tipo já barra Perdido; a guarda em tempo de execução protege chamadas sem tipo (ferramentas do assistente).
    // @ts-expect-error
    expect(mudarEtapa(session, negocio.id, "perdido")).rejects.toBeInstanceOf(
      EtapaInvalidaError,
    );
    expect(marcarPerdido(session, negocio.id, "   ")).rejects.toBeInstanceOf(
      MotivoObrigatorioError,
    );

    const perdido = await marcarPerdido(
      session,
      negocio.id,
      "Comprou em outro",
    );
    expect(perdido).toMatchObject({
      etapa: "perdido",
      motivoPerda: "Comprou em outro",
    });
    // Repetir não duplica o histórico nem troca o motivo.
    await marcarPerdido(session, negocio.id, "outro motivo");
    const detalhe = await negocioOuFalha(session, negocio.id);
    expect(detalhe.motivoPerda).toBe("Comprou em outro");
    expect(detalhe.historico.filter((h) => h.para === "perdido")).toHaveLength(
      1,
    );
  });

  test("reabrir volta à etapa anterior ao Perdido e limpa o motivo", async () => {
    const { session, negocio } = await criarNegocioDaAna();
    await mudarEtapa(session, negocio.id, "proposta_em_revisao");
    await marcarPerdido(session, negocio.id, "Desistiu");

    const reaberto = await reabrir(session, negocio.id);

    expect(reaberto).toMatchObject({
      etapa: "proposta_em_revisao",
      motivoPerda: null,
    });
    const { historico } = await negocioOuFalha(session, negocio.id);
    expect(historico.at(-1)).toMatchObject({
      de: "perdido",
      para: "proposta_em_revisao",
      autor: "corretor",
    });
    // Reabrir um negócio aberto não muda nada.
    expect(await reabrir(session, negocio.id)).toMatchObject({
      etapa: "proposta_em_revisao",
    });
    expect((await negocioOuFalha(session, negocio.id)).historico).toHaveLength(
      historico.length,
    );
  });

  test("reabrir um negócio perdido ainda em Novo volta para Novo", async () => {
    const { session, negocio } = await criarNegocioDaAna();
    await marcarPerdido(session, negocio.id, "Sem interesse");

    expect(await reabrir(session, negocio.id)).toMatchObject({ etapa: "novo" });
  });
});

describe("cadastro manual", () => {
  test("cria cliente e negócio em Novo; repetir com o mesmo id não duplica", async () => {
    const { imobiliaria, corretor } = await criarAna();
    const session = sessaoDe(corretor, imobiliaria);
    const clienteId = crypto.randomUUID();
    const negocioId = crypto.randomUUID();
    const input = {
      id: clienteId,
      nome: "Maria",
      telefone: "(88) 99999-1234",
      email: "maria@exemplo.com",
    };

    const cliente = await criarCliente(session, input);
    const deNovo = await criarCliente(session, input);
    const [n1, n2] = await Promise.all([
      criarNegocio(session, { id: negocioId, clienteId }),
      criarNegocio(session, { id: negocioId, clienteId }),
    ]);

    expect(cliente).toMatchObject({
      id: clienteId,
      nome: "Maria",
      telefone: "5588999991234",
      email: "maria@exemplo.com",
    });
    expect(deNovo).toEqual(cliente);
    expect(n1).toEqual(n2);
    expect(n1).toMatchObject({ id: negocioId, clienteId, etapa: "novo" });
    const quadro = await listarNegociosPorEtapa(session);
    expect(quadro.novo).toHaveLength(1);
    const detalhe = await negocioOuFalha(session, negocioId);
    expect(detalhe.historico).toEqual([
      expect.objectContaining({ de: null, para: "novo", autor: "corretor" }),
    ]);
  });

  test("um cliente pode ter vários negócios", async () => {
    const { session, cliente, negocio } = await criarNegocioDaAna();

    const segundo = await criarNegocio(session, { clienteId: cliente.id });

    expect(segundo?.id).not.toBe(negocio.id);
    const quadro = await listarNegociosPorEtapa(session);
    expect(quadro.novo.map((n) => n.clienteId)).toEqual([
      cliente.id,
      cliente.id,
    ]);
  });

  test("telefone repetido para o mesmo corretor é recusado; cliente de outro corretor não ganha negócio", async () => {
    const { session, cliente, imobiliaria } = await criarNegocioDaAna();
    const colega = sessaoDe({ id: crypto.randomUUID() }, imobiliaria);

    expect(
      criarCliente(session, {
        nome: "Outro Carlos",
        telefone: cliente.telefone,
      }),
    ).rejects.toBeInstanceOf(TelefoneDuplicadoError);
    expect(await criarNegocio(colega, { clienteId: cliente.id })).toBeNull();
    expect(
      criarCliente(administrador, { nome: "X", telefone: "1" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
