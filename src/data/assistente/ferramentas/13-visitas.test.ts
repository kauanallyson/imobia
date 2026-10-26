import { describe, expect, setSystemTime, test } from "bun:test";
import { pedidos, roteirizar } from "@/test/fakes/llm";
import { enviados, mensagemRecebida } from "@/test/fakes/whatsapp";
import { criarCenarioDeVisitaDaAna, ok } from "@/test/fixtures";
import { receberMensagem } from "../../conversas";
import { buscarNegocio } from "../../negocios";
import { buscarVisitaAtiva } from "../../visitas";

const segunda8h = new Date("2026-11-02T08:00:00-03:00");

// O cliente do cenário manda mensagem; o LLM está roteirizado pelo teste.
async function clienteDiz(instancia: string, texto: string) {
  return receberMensagem(
    mensagemRecebida({ instancia, telefone: "5588999990000", texto }),
  );
}

describe("assistente: visitas", () => {
  test("oferece só horários livres e agenda o escolhido, com confirmação e localização", async () => {
    setSystemTime(segunda8h);
    const { instancia, session, negocio } = await criarCenarioDeVisitaDaAna();
    roteirizar(
      {
        tipo: "chamadas",
        chamadas: [{ nome: "listar_horarios_livres", argumentos: { dias: 1 } }],
      },
      { tipo: "texto", texto: "Tenho hoje às 9h, 9h30, 10h, 10h30 ou 11h." },
    );
    await clienteDiz(instancia, "Quero visitar");

    const resultado = pedidos[1]?.respostaAnterior?.resultados[0]
      ?.resultado as {
      horarios: Array<{ dataHoraISO: string }>;
    };
    expect(resultado.horarios.map((h) => h.dataHoraISO)).toEqual(
      ["09:00", "09:30", "10:00", "10:30", "11:00"].map((h) =>
        new Date(`2026-11-02T${h}:00-03:00`).toISOString(),
      ),
    );

    enviados.length = 0;
    roteirizar(
      {
        tipo: "chamadas",
        chamadas: [
          {
            nome: "agendar_visita",
            argumentos: { dataHoraISO: "2026-11-02T10:00:00-03:00" },
          },
        ],
      },
      { tipo: "texto", texto: "Combinado, até as 10h!" },
    );
    await clienteDiz(instancia, "Pode ser 10h");

    expect(enviados.map((e) => e.tipo)).toEqual([
      "texto",
      "localizacao",
      "texto",
    ]);
    const visita = ok(await buscarVisitaAtiva(session, negocio.id));
    expect(visita.dataHora).toEqual(new Date("2026-11-02T10:00:00-03:00"));
    expect(ok(await buscarNegocio(session, negocio.id)).etapa).toBe(
      "visita_agendada",
    );
  });

  test("horário ocupado volta como erro para o modelo, sem derrubar o atendimento", async () => {
    setSystemTime(segunda8h);
    const { instancia } = await criarCenarioDeVisitaDaAna();
    roteirizar(
      {
        tipo: "chamadas",
        chamadas: [
          {
            nome: "agendar_visita",
            argumentos: { dataHoraISO: "2026-11-02T13:00:00-03:00" },
          },
        ],
      },
      { tipo: "texto", texto: "Esse horário não está disponível." },
    );
    await clienteDiz(instancia, "Pode ser 13h");
    const resultado = pedidos[1]?.respostaAnterior?.resultados[0]?.resultado;
    expect(resultado).toMatchObject({ erro: expect.any(String) });
    expect(enviados.map((e) => e.tipo)).toEqual(["texto"]);
  });

  test("cliente remarca pela conversa", async () => {
    setSystemTime(segunda8h);
    const { instancia, session, negocio } = await criarCenarioDeVisitaDaAna();
    roteirizar(
      {
        tipo: "chamadas",
        chamadas: [
          {
            nome: "agendar_visita",
            argumentos: { dataHoraISO: "2026-11-02T10:00:00-03:00" },
          },
        ],
      },
      { tipo: "texto", texto: "Marcado." },
    );
    await clienteDiz(instancia, "10h");
    roteirizar(
      {
        tipo: "chamadas",
        chamadas: [
          {
            nome: "remarcar_visita",
            argumentos: { dataHoraISO: "2026-11-03T09:00:00-03:00" },
          },
        ],
      },
      { tipo: "texto", texto: "Remarcado para amanhã às 9h." },
    );
    await clienteDiz(instancia, "Não vou conseguir, pode ser amanhã 9h?");

    const visita = ok(await buscarVisitaAtiva(session, negocio.id));
    expect(visita).toMatchObject({
      dataHora: new Date("2026-11-03T09:00:00-03:00"),
      estado: "remarcada",
    });
  });

  test("fechar agora pula a visita e leva a Coletando dados", async () => {
    setSystemTime(segunda8h);
    const { instancia, session, negocio } = await criarCenarioDeVisitaDaAna();
    roteirizar(
      {
        tipo: "chamadas",
        chamadas: [{ nome: "fechar_agora", argumentos: {} }],
      },
      { tipo: "texto", texto: "Ótimo! Vamos aos documentos." },
    );
    await clienteDiz(instancia, "Não preciso visitar, quero fechar");

    const detalhe = ok(await buscarNegocio(session, negocio.id));
    expect(detalhe.etapa).toBe("coletando_dados");
    expect(
      detalhe.historico.find((h) => h.para === "coletando_dados"),
    ).toMatchObject({ de: "em_atendimento", autor: "assistente" });
  });
});
