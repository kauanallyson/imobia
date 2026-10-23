import { describe, expect, setSystemTime, test } from "bun:test";
import { pedidos, roteirizar } from "@/test/fakes/llm";
import {
  avisosDoSistema,
  enviados,
  mensagemRecebida,
} from "@/test/fakes/whatsapp";
import {
  conectarWhatsappDaAna,
  criarConcorrente,
  criarEmpreendimentoDaAna,
  darTelefoneAAna,
  ok,
} from "@/test/fixtures";
import { receberMensagem } from "./conversas";
import { buscarNegocio, listarNegocios } from "./negocios";
import {
  criarPendencia,
  enviarAvisosPendentes,
  listarPendencias,
  resolverPendencia,
} from "./pendencias";
import { ForbiddenError, type Session } from "./session";

const telefone = "5588999990000";
const telefoneDaAna = "5588988880000";
// Terça-feira, 10h em Brasília: dentro da janela de avisos.
const TERCA_10H = new Date("2026-03-10T10:00:00-03:00");

describe("pendências", () => {
  test("pergunta sem resposta na base cria pendência e o assistente avisa o cliente que vai verificar", async () => {
    setSystemTime(TERCA_10H);
    const { session, instancia } = await conectarWhatsappDaAna();
    await criarEmpreendimentoDaAna(session);
    roteirizar(
      {
        tipo: "chamadas",
        chamadas: [
          {
            nome: "buscar_base_de_conhecimento",
            argumentos: { pergunta: "O condomínio aceita pets?" },
          },
        ],
      },
      {
        tipo: "chamadas",
        chamadas: [
          {
            nome: "criar_pendencia_pergunta_sem_resposta",
            argumentos: { pergunta: "O condomínio aceita pets?" },
          },
        ],
      },
      { tipo: "texto", texto: "Vou verificar com a Ana e te retorno!" },
    );

    await receberMensagem(
      mensagemRecebida({ instancia, telefone, texto: "Aceita pets?" }),
    );

    expect(pedidos[1]?.respostaAnterior?.resultados[0]?.resultado).toEqual({
      empreendimento: "Jardim das Flores",
      trechos: [],
    });
    expect(pedidos[2]?.respostaAnterior?.resultados[0]?.resultado).toEqual({
      pendenciaId: expect.any(String),
      tipo: "pergunta_sem_resposta",
    });
    expect(enviados).toEqual([
      {
        instancia,
        para: telefone,
        tipo: "texto",
        texto: "Vou verificar com a Ana e te retorno!",
      },
    ]);
    const [negocio] = await listarNegocios(session);
    const lista = await listarPendencias(session);
    expect(lista).toEqual([
      expect.objectContaining({
        negocioId: negocio.id,
        tipo: "pergunta_sem_resposta",
        descricao: "O condomínio aceita pets?",
        estado: "aberta",
        criadaEm: TERCA_10H,
        clienteNome: telefone,
      }),
    ]);
  });

  test("pedido de falar com uma pessoa cria pendência urgente, pausa o assistente e avisa o corretor na hora", async () => {
    // Domingo, 23h: fora da janela, mas o tipo é urgente.
    setSystemTime(new Date("2026-03-08T23:00:00-03:00"));
    const { session, instancia, corretor } = await conectarWhatsappDaAna();
    await darTelefoneAAna(corretor, telefoneDaAna);
    roteirizar(
      {
        tipo: "chamadas",
        chamadas: [
          {
            nome: "chamar_corretor",
            argumentos: { motivo: "Cliente quer falar com uma pessoa" },
          },
        ],
      },
      { tipo: "texto", texto: "Claro, vou avisar a Ana para falar com você." },
      { tipo: "texto", texto: "Não deveria responder" },
    );

    const result = await receberMensagem(
      mensagemRecebida({
        instancia,
        telefone,
        texto: "Quero falar com uma pessoa",
      }),
    );

    const [pendencia] = await listarPendencias(session);
    expect(pendencia).toMatchObject({
      tipo: "cliente_pediu_pessoa",
      descricao: "Cliente quer falar com uma pessoa",
      estado: "aberta",
      avisoEnviadoEm: new Date("2026-03-08T23:00:00-03:00"),
    });
    expect(avisosDoSistema).toEqual([
      {
        para: telefoneDaAna,
        texto: expect.stringContaining(
          `http://localhost:3000/painel/pendencias/${pendencia.id}`,
        ),
      },
    ]);
    expect(avisosDoSistema[0]?.texto).toContain("pediu para falar com você");
    expect(enviados).toHaveLength(1);

    const negocio = ok(await buscarNegocio(session, pendencia.negocioId));
    expect(negocio.conversa?.assistente).toBe("pausado");
    // Conversa pausada: a próxima mensagem do cliente fica sem resposta.
    await receberMensagem(
      mensagemRecebida({ instancia, telefone, texto: "Alô?" }),
    );
    expect(enviados).toHaveLength(1);
    expect(result?.conversaId).toBeDefined();
  });

  test("aviso não urgente às 22h espera o job rodar dentro da janela", async () => {
    setSystemTime(new Date("2026-03-10T22:00:00-03:00"));
    const { session, corretor, instancia } = await conectarWhatsappDaAna();
    await darTelefoneAAna(corretor, telefoneDaAna);
    const { negocio } = await negocioPorMensagem(session, instancia);

    const pendencia = ok(
      await criarPendencia(session, {
        negocioId: negocio.id,
        tipo: "pergunta_sem_resposta",
        descricao: "Tem escola perto?",
      }),
    );
    expect(pendencia.avisoEnviadoEm).toBeNull();
    expect(avisosDoSistema).toEqual([]);

    // Ainda fora da janela (7h59) → nada.
    setSystemTime(new Date("2026-03-11T07:59:00-03:00"));
    await enviarAvisosPendentes();
    expect(avisosDoSistema).toEqual([]);

    // Dentro da janela → um aviso, e só um.
    setSystemTime(new Date("2026-03-11T08:00:00-03:00"));
    await enviarAvisosPendentes();
    await enviarAvisosPendentes();
    expect(avisosDoSistema).toEqual([
      {
        para: telefoneDaAna,
        texto: expect.stringContaining(`/painel/pendencias/${pendencia.id}`),
      },
    ]);
    const [atual] = await listarPendencias(session);
    expect(atual.avisoEnviadoEm).toEqual(new Date("2026-03-11T08:00:00-03:00"));
  });

  test("domingo dentro do horário também espera; segunda às 8h envia", async () => {
    // Domingo, 10h.
    setSystemTime(new Date("2026-03-08T10:00:00-03:00"));
    const { session, corretor, instancia } = await conectarWhatsappDaAna();
    await darTelefoneAAna(corretor, telefoneDaAna);
    const { negocio } = await negocioPorMensagem(session, instancia);
    await criarPendencia(session, {
      negocioId: negocio.id,
      tipo: "confirmar_pagamento",
      descricao: "Comprovante recebido",
    });
    expect(avisosDoSistema).toEqual([]);

    setSystemTime(new Date("2026-03-09T08:00:00-03:00"));
    await enviarAvisosPendentes();
    expect(avisosDoSistema).toHaveLength(1);
  });

  test("corretor sem telefone não recebe aviso e a pendência segue aberta", async () => {
    setSystemTime(TERCA_10H);
    const { session, instancia } = await conectarWhatsappDaAna();
    const { negocio } = await negocioPorMensagem(session, instancia);
    const pendencia = ok(
      await criarPendencia(session, {
        negocioId: negocio.id,
        tipo: "revisar_proposta",
        descricao: "Proposta 1",
      }),
    );
    expect(avisosDoSistema).toEqual([]);
    expect(pendencia.avisoEnviadoEm).toBeNull();
    expect(pendencia.estado).toBe("aberta");
  });

  test("repetir a criação com a mesma chave natural devolve a pendência existente", async () => {
    setSystemTime(TERCA_10H);
    const { session, corretor, instancia } = await conectarWhatsappDaAna();
    await darTelefoneAAna(corretor, telefoneDaAna);
    const { negocio } = await negocioPorMensagem(session, instancia);
    const input = {
      negocioId: negocio.id,
      tipo: "pergunta_sem_resposta" as const,
      descricao: "Tem escola perto?",
    };

    const first = ok(await criarPendencia(session, input));
    const second = ok(await criarPendencia(session, input));
    const [a, b] = await Promise.all([
      criarPendencia(session, { ...input, id: crypto.randomUUID() }),
      criarPendencia(session, { ...input, id: crypto.randomUUID() }),
    ]);

    expect(second).toEqual(first);
    expect(a).toEqual(first);
    expect(b).toEqual(first);
    expect(await listarPendencias(session)).toHaveLength(1);
    expect(avisosDoSistema).toHaveLength(1);
    // Resolvida, a mesma pergunta pode virar uma pendência nova.
    await resolverPendencia(session, first.id);
    const terceira = ok(await criarPendencia(session, input));
    expect(terceira.id).not.toBe(first.id);
  });

  test("resolver leva a resolvida uma vez; repetir não muda nada; lista mostra abertas primeiro", async () => {
    setSystemTime(TERCA_10H);
    const { session, instancia } = await conectarWhatsappDaAna();
    const { negocio } = await negocioPorMensagem(session, instancia);
    ok(
      await criarPendencia(session, {
        negocioId: negocio.id,
        tipo: "pergunta_sem_resposta",
        descricao: "Antiga",
      }),
    );
    setSystemTime(new Date("2026-03-10T11:00:00-03:00"));
    const nova = ok(
      await criarPendencia(session, {
        negocioId: negocio.id,
        tipo: "revisar_proposta",
        descricao: "Nova",
      }),
    );

    setSystemTime(new Date("2026-03-10T12:00:00-03:00"));
    const resolvida = ok(await resolverPendencia(session, nova.id));
    expect(resolvida).toMatchObject({
      estado: "resolvida",
      resolvidaEm: new Date("2026-03-10T12:00:00-03:00"),
    });
    setSystemTime(new Date("2026-03-10T13:00:00-03:00"));
    expect(await resolverPendencia(session, nova.id)).toEqual(resolvida);

    const lista = await listarPendencias(session);
    expect(lista.map((p) => [p.descricao, p.estado])).toEqual([
      ["Antiga", "aberta"],
      ["Nova", "resolvida"],
    ]);
  });

  test("pendências são do corretor: outro corretor não vê nem resolve; administrador não entra", async () => {
    setSystemTime(TERCA_10H);
    const { session, instancia } = await conectarWhatsappDaAna();
    const { negocio } = await negocioPorMensagem(session, instancia);
    const pendencia = ok(
      await criarPendencia(session, {
        negocioId: negocio.id,
        tipo: "pergunta_sem_resposta",
        descricao: "Tem escola perto?",
      }),
    );
    const concorrente = await criarConcorrente();

    expect(await listarPendencias(concorrente.session)).toEqual([]);
    expect(
      await resolverPendencia(concorrente.session, pendencia.id),
    ).toBeNull();
    expect(
      await criarPendencia(concorrente.session, {
        negocioId: negocio.id,
        tipo: "revisar_proposta",
        descricao: "x",
      }),
    ).toBeNull();
    expect(await resolverPendencia(session, "nao-uuid")).toBeNull();
    expect(listarPendencias({ role: "administrador" })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect((await listarPendencias(session))[0]?.estado).toBe("aberta");
  });
});

// Um negócio da Ana nascido de uma mensagem do cliente.
async function negocioPorMensagem(session: Session, instancia: string) {
  roteirizar({ tipo: "texto", texto: "Olá!" });
  await receberMensagem(mensagemRecebida({ instancia, telefone }));
  enviados.length = 0;
  const [negocio] = await listarNegocios(session);
  return { negocio: ok(negocio) };
}
