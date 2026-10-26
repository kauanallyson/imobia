import { describe, expect, setSystemTime, test } from "bun:test";
import {
  aoEnviarEcoar,
  avisosDoSistema,
  enviados,
} from "@/test/fakes/whatsapp";
import {
  criarBruno,
  criarCenarioDeVisitaDaAna,
  criarConcorrente,
  darTelefoneAAna,
  ok,
  sessaoDe,
} from "@/test/fixtures";
import { apagarDadosDoCliente } from "./coleta-de-dados";
import { receberMensagem } from "./conversas";
import { bloquearData, criarJanela } from "./disponibilidade";
import { desligarAssistente, registrarOptOut } from "./estado-do-assistente";
import { buscarNegocio, listarNegocios } from "./negocios";
import {
  agendarVisita,
  alterarLocalDaVisita,
  buscarVisitaAtiva,
  cancelarVisita,
  enviarLembretesDeVisita,
  HorarioIndisponivelError,
  horariosLivres,
  listarVisitas,
  remarcarVisita,
} from "./visitas";

// Segunda-feira, 2 de novembro de 2026, 08:00 em Brasília.
const segunda8h = new Date("2026-11-02T08:00:00-03:00");
const iso = (d: Date) => d.toISOString();

describe("horários livres", () => {
  test("são os encaixes de 60 min, de meia em meia hora, dentro das janelas da semana", async () => {
    setSystemTime(segunda8h);
    const { session } = await criarCenarioDeVisitaDaAna();

    const livres = await horariosLivres(session, {
      aPartirDe: segunda8h,
      dias: 1,
    });

    expect(livres.map(iso)).toEqual(
      ["09:00", "09:30", "10:00", "10:30", "11:00"].map((h) =>
        iso(new Date(`2026-11-02T${h}:00-03:00`)),
      ),
    );
  });

  test("excluem datas bloqueadas, horários já passados e encaixes que conflitam com outra visita", async () => {
    setSystemTime(segunda8h);
    const { session, negocio } = await criarCenarioDeVisitaDaAna();
    await bloquearData(session, { data: "2026-11-03" });
    await agendarVisita(session, {
      negocioId: negocio.id,
      dataHora: new Date("2026-11-02T10:00:00-03:00"),
    });

    const aPartirDe = new Date("2026-11-02T09:10:00-03:00");
    const livres = await horariosLivres(session, { aPartirDe, dias: 2 });

    // Segunda: 09:00 já passou; 09:30, 10:00 e 10:30 batem com a visita das
    // 10:00; terça está bloqueada.
    expect(livres.map(iso)).toEqual([
      iso(new Date("2026-11-02T11:00:00-03:00")),
    ]);
  });

  test("corretor sem janelas não tem horários", async () => {
    setSystemTime(segunda8h);
    const { imobiliaria } = await criarCenarioDeVisitaDaAna();
    const bruno = sessaoDe(await criarBruno(imobiliaria), imobiliaria);
    expect(
      await horariosLivres(bruno, { aPartirDe: segunda8h, dias: 7 }),
    ).toEqual([]);
  });

  test("nunca oferece horários depois do domingo da semana corrente", async () => {
    setSystemTime(segunda8h);
    const { session } = await criarCenarioDeVisitaDaAna();
    await criarJanela(session, {
      diaDaSemana: 0,
      inicio: "09:00",
      fim: "12:00",
    });

    const livres = await horariosLivres(session, {
      aPartirDe: segunda8h,
      dias: 30,
    });

    expect(livres.length).toBeGreaterThan(0);
    expect(livres).toContainEqual(new Date("2026-11-08T09:00:00-03:00"));
    expect(
      livres.every(
        (horario) => horario <= new Date("2026-11-08T23:59:59-03:00"),
      ),
    ).toBe(true);
  });

  test("no domingo, inclui hoje e exclui a segunda-feira seguinte", async () => {
    const domingo8h = new Date("2026-11-08T08:00:00-03:00");
    setSystemTime(domingo8h);
    const { session } = await criarCenarioDeVisitaDaAna();
    await criarJanela(session, {
      diaDaSemana: 0,
      inicio: "09:00",
      fim: "12:00",
    });

    const livres = await horariosLivres(session, {
      aPartirDe: domingo8h,
      dias: 7,
    });

    expect(livres).toContainEqual(new Date("2026-11-08T09:00:00-03:00"));
    expect(
      livres.every((horario) => horario.toISOString().startsWith("2026-11-08")),
    ).toBe(true);
  });
});

describe("agendar visita", () => {
  test("cria a visita no endereço do empreendimento, confirma com texto e localização e leva o negócio a Visita agendada", async () => {
    setSystemTime(segunda8h);
    const { session, negocio, instancia, cliente, empreendimento } =
      await criarCenarioDeVisitaDaAna();
    const dataHora = new Date("2026-11-02T10:00:00-03:00");

    const visita = ok(
      await agendarVisita(session, {
        negocioId: negocio.id,
        dataHora,
        autor: "assistente",
        notificarCliente: true,
      }),
    );

    expect(visita).toMatchObject({
      negocioId: negocio.id,
      dataHora,
      local: empreendimento.endereco,
      latitude: -3.6891,
      longitude: -40.3482,
      estado: "agendada",
    });
    expect(enviados).toMatchObject([
      { instancia, para: cliente.telefone, tipo: "texto" },
      {
        instancia,
        para: cliente.telefone,
        tipo: "localizacao",
        latitude: -3.6891,
        longitude: -40.3482,
      },
    ]);
    expect(enviados[0]?.tipo === "texto" && enviados[0].texto).toContain(
      "02/11",
    );
    const detalhe = ok(await buscarNegocio(session, negocio.id));
    expect(detalhe.etapa).toBe("visita_agendada");
    // O relógio está parado: a ordem por `em` empata, então busque a entrada.
    expect(
      detalhe.historico.find((h) => h.para === "visita_agendada"),
    ).toMatchObject({ de: "em_atendimento", autor: "assistente" });
  });

  test("o eco da confirmação e da localização não pausa o assistente", async () => {
    setSystemTime(segunda8h);
    const { session, negocio } = await criarCenarioDeVisitaDaAna();
    aoEnviarEcoar(receberMensagem);

    ok(
      await agendarVisita(session, {
        negocioId: negocio.id,
        dataHora: new Date("2026-11-02T10:00:00-03:00"),
        autor: "assistente",
        notificarCliente: true,
      }),
    );

    const conversa = ok((await buscarNegocio(session, negocio.id))?.conversa);
    expect(conversa.assistente).toBe("ativo");
    expect(conversa.mensagens.filter((m) => m.autor === "corretor")).toEqual(
      [],
    );
  });

  test("sem notificar (corretor), nada sai pelo WhatsApp", async () => {
    setSystemTime(segunda8h);
    const { session, negocio } = await criarCenarioDeVisitaDaAna();
    await agendarVisita(session, {
      negocioId: negocio.id,
      dataHora: new Date("2026-11-02T10:00:00-03:00"),
    });
    expect(enviados).toEqual([]);
    const [n] = await listarNegocios(session);
    expect(n?.etapa).toBe("visita_agendada");
  });

  test("horário ocupado, fora da janela, bloqueado ou no passado é recusado", async () => {
    setSystemTime(segunda8h);
    const { session, negocio } = await criarCenarioDeVisitaDaAna();
    await bloquearData(session, { data: "2026-11-04" });
    await agendarVisita(session, {
      negocioId: negocio.id,
      dataHora: new Date("2026-11-02T10:00:00-03:00"),
    });

    for (const dataHora of [
      new Date("2026-11-02T10:30:00-03:00"), // conflita com a das 10:00
      new Date("2026-11-02T13:00:00-03:00"), // fora da janela
      new Date("2026-11-02T11:30:00-03:00"), // termina depois da janela
      new Date("2026-11-04T10:00:00-03:00"), // data bloqueada
      new Date("2026-11-01T10:00:00-03:00"), // passado
      new Date("2026-11-03T10:15:00-03:00"), // fora da grade de 30 min
    ]) {
      await expect(
        agendarVisita(session, { negocioId: negocio.id, dataHora }),
      ).rejects.toBeInstanceOf(HorarioIndisponivelError);
    }
    expect(await listarVisitas(session)).toHaveLength(1);
  });

  test("repetir com o mesmo id devolve a mesma visita e não reenvia a confirmação", async () => {
    setSystemTime(segunda8h);
    const { session, negocio } = await criarCenarioDeVisitaDaAna();
    const input = {
      id: crypto.randomUUID(),
      negocioId: negocio.id,
      dataHora: new Date("2026-11-02T10:00:00-03:00"),
      notificarCliente: true,
    };
    const first = await agendarVisita(session, input);
    const second = await agendarVisita(session, input);
    expect(second).toEqual(first);
    expect(await listarVisitas(session)).toHaveLength(1);
    expect(enviados).toHaveLength(2);
  });

  test("duas chamadas simultâneas para o mesmo horário resultam em uma só visita", async () => {
    setSystemTime(segunda8h);
    const { session, negocio } = await criarCenarioDeVisitaDaAna();
    const dataHora = new Date("2026-11-02T10:00:00-03:00");
    const results = await Promise.allSettled([
      agendarVisita(session, { negocioId: negocio.id, dataHora }),
      agendarVisita(session, { negocioId: negocio.id, dataHora }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await listarVisitas(session)).toHaveLength(1);
  });

  test("negócio de outro corretor → null", async () => {
    setSystemTime(segunda8h);
    const { negocio } = await criarCenarioDeVisitaDaAna();
    const { session: carla } = await criarConcorrente();
    expect(
      await agendarVisita(carla, {
        negocioId: negocio.id,
        dataHora: new Date("2026-11-02T10:00:00-03:00"),
      }),
    ).toBeNull();
  });
});

describe("remarcar, cancelar e alterar o local", () => {
  test("cliente remarca: a visita muda de horário, fica Remarcada e o horário antigo volta a ficar livre", async () => {
    setSystemTime(segunda8h);
    const { session, negocio } = await criarCenarioDeVisitaDaAna();
    const visita = ok(
      await agendarVisita(session, {
        negocioId: negocio.id,
        dataHora: new Date("2026-11-02T10:00:00-03:00"),
      }),
    );

    const nova = new Date("2026-11-03T09:00:00-03:00");
    const remarcada = ok(
      await remarcarVisita(session, visita.id, {
        dataHora: nova,
        autor: "assistente",
        notificarCliente: true,
      }),
    );

    expect(remarcada).toMatchObject({
      id: visita.id,
      dataHora: nova,
      estado: "remarcada",
    });
    expect(enviados.map((e) => e.tipo)).toEqual(["texto", "localizacao"]);
    const livres = await horariosLivres(session, {
      aPartirDe: segunda8h,
      dias: 1,
    });
    expect(livres.map(iso)).toContain(
      iso(new Date("2026-11-02T10:00:00-03:00")),
    );
    expect(await buscarVisitaAtiva(session, negocio.id)).toMatchObject({
      id: visita.id,
      dataHora: nova,
    });
  });

  test("corretor altera o local da visita", async () => {
    setSystemTime(segunda8h);
    const { session, negocio } = await criarCenarioDeVisitaDaAna();
    const visita = ok(
      await agendarVisita(session, {
        negocioId: negocio.id,
        dataHora: new Date("2026-11-02T10:00:00-03:00"),
      }),
    );
    const alterada = ok(
      await alterarLocalDaVisita(session, visita.id, {
        local: "Fiel Imóveis, Rua Coronel Mont'Alverne, 100",
      }),
    );
    expect(alterada).toMatchObject({
      id: visita.id,
      local: "Fiel Imóveis, Rua Coronel Mont'Alverne, 100",
      latitude: null,
      longitude: null,
    });
    const { session: carla } = await criarConcorrente();
    expect(
      await alterarLocalDaVisita(carla, visita.id, { local: "x" }),
    ).toBeNull();
  });

  test("cancelar libera o horário e é idempotente", async () => {
    setSystemTime(segunda8h);
    const { session, negocio } = await criarCenarioDeVisitaDaAna();
    const dataHora = new Date("2026-11-02T10:00:00-03:00");
    const visita = ok(
      await agendarVisita(session, { negocioId: negocio.id, dataHora }),
    );

    expect(await cancelarVisita(session, visita.id)).toMatchObject({
      estado: "cancelada",
    });
    expect(await cancelarVisita(session, visita.id)).toMatchObject({
      estado: "cancelada",
    });
    expect(await buscarVisitaAtiva(session, negocio.id)).toBeNull();
    expect(
      await agendarVisita(session, { negocioId: negocio.id, dataHora }),
    ).toMatchObject({ estado: "agendada" });
  });
});

describe("lembretes de visita (worker)", () => {
  // Visita na terça 03/11 às 10:00.
  async function visitaDeTerca() {
    setSystemTime(segunda8h);
    const cenario = await criarCenarioDeVisitaDaAna();
    const visita = ok(
      await agendarVisita(cenario.session, {
        negocioId: cenario.negocio.id,
        dataHora: new Date("2026-11-03T10:00:00-03:00"),
      }),
    );
    enviados.length = 0;
    return { ...cenario, visita };
  }

  test("véspera a partir das 8h do dia anterior; manhã entre 8h e a visita; nunca duas vezes", async () => {
    const { cliente } = await visitaDeTerca();

    setSystemTime(new Date("2026-11-02T07:59:00-03:00"));
    await enviarLembretesDeVisita();
    expect(enviados).toEqual([]);

    setSystemTime(new Date("2026-11-02T08:00:00-03:00"));
    await enviarLembretesDeVisita();
    expect(enviados).toHaveLength(1);
    expect(enviados[0]).toMatchObject({
      para: cliente.telefone,
      tipo: "texto",
    });
    expect(enviados[0]?.tipo === "texto" && enviados[0].texto).toContain(
      "amanhã",
    );

    // Rodar de novo no mesmo horário (e mais tarde no dia) não reenvia.
    await enviarLembretesDeVisita();
    setSystemTime(new Date("2026-11-02T15:00:00-03:00"));
    await enviarLembretesDeVisita();
    expect(enviados).toHaveLength(1);

    setSystemTime(new Date("2026-11-03T07:30:00-03:00"));
    await enviarLembretesDeVisita();
    expect(enviados).toHaveLength(1);

    setSystemTime(new Date("2026-11-03T08:30:00-03:00"));
    await enviarLembretesDeVisita();
    await enviarLembretesDeVisita();
    expect(enviados).toHaveLength(2);
    expect(enviados[1]?.tipo === "texto" && enviados[1].texto).toContain(
      "hoje",
    );

    setSystemTime(new Date("2026-11-03T10:30:00-03:00"));
    await enviarLembretesDeVisita();
    expect(enviados).toHaveLength(2);
  });

  test("depois da visita nada sai; visita cancelada não recebe lembrete", async () => {
    const { session, visita } = await visitaDeTerca();

    setSystemTime(new Date("2026-11-03T10:30:00-03:00"));
    await enviarLembretesDeVisita();
    expect(enviados).toEqual([]);

    await cancelarVisita(session, visita.id);
    setSystemTime(new Date("2026-11-02T09:00:00-03:00"));
    await enviarLembretesDeVisita();
    expect(enviados).toEqual([]);
  });

  test("lembrete do corretor sai pelo número de sistema e não duplica", async () => {
    const { corretor } = await visitaDeTerca();
    await darTelefoneAAna(corretor);
    avisosDoSistema.length = 0;

    setSystemTime(new Date("2026-11-02T08:00:00-03:00"));
    await enviarLembretesDeVisita();
    await enviarLembretesDeVisita();

    expect(avisosDoSistema).toHaveLength(1);
    expect(avisosDoSistema[0]).toMatchObject({
      para: "5588988880000",
      texto: expect.stringContaining("Carlos Lima"),
    });
  });

  test("cliente com opt-out não recebe a confirmação da visita", async () => {
    setSystemTime(segunda8h);
    const { session, negocio } = await criarCenarioDeVisitaDaAna();
    const conversa = ok((await buscarNegocio(session, negocio.id))?.conversa);
    await registrarOptOut(session, conversa.id, { autor: "corretor" });
    enviados.length = 0;

    ok(
      await agendarVisita(session, {
        negocioId: negocio.id,
        dataHora: new Date("2026-11-03T10:00:00-03:00"),
        notificarCliente: true,
      }),
    );

    expect(enviados).toEqual([]);
  });

  test("só sai entre 8h e 20h, de segunda a sábado", async () => {
    await visitaDeTerca();
    setSystemTime(new Date("2026-11-02T20:00:00-03:00"));
    await enviarLembretesDeVisita();
    expect(enviados).toEqual([]);
  });

  test("a véspera de uma visita na segunda não sai no domingo", async () => {
    setSystemTime(new Date("2026-11-06T09:00:00-03:00"));
    const cenario = await criarCenarioDeVisitaDaAna();
    await criarJanela(cenario.session, {
      diaDaSemana: 1,
      inicio: "09:00",
      fim: "12:00",
    });
    ok(
      await agendarVisita(cenario.session, {
        negocioId: cenario.negocio.id,
        dataHora: new Date("2026-11-09T10:00:00-03:00"),
      }),
    );
    enviados.length = 0;

    setSystemTime(new Date("2026-11-08T10:00:00-03:00"));
    await enviarLembretesDeVisita();
    expect(enviados).toEqual([]);
  });

  for (const bloqueio of ["opt-out", "desligado", "dados apagados"] as const) {
    test(`cliente com ${bloqueio} não recebe lembrete; o corretor recebe`, async () => {
      const { session, corretor, cliente, negocio } = await visitaDeTerca();
      await darTelefoneAAna(corretor);
      const conversaId = ok(
        (await buscarNegocio(session, negocio.id))?.conversa,
      ).id;
      if (bloqueio === "opt-out") {
        await registrarOptOut(session, conversaId, { autor: "corretor" });
      } else if (bloqueio === "desligado") {
        await desligarAssistente(session, conversaId);
      } else {
        await apagarDadosDoCliente(session, cliente.id);
      }
      enviados.length = 0;
      avisosDoSistema.length = 0;

      setSystemTime(new Date("2026-11-02T09:00:00-03:00"));
      await enviarLembretesDeVisita();
      expect(enviados).toEqual([]);
      expect(avisosDoSistema).toHaveLength(1);
    });
  }
});
