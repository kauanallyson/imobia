import { describe, expect, setSystemTime, test } from "bun:test";
import {
  chamadas,
  eventos,
  falhas,
  simularApagar,
  simularCompromisso,
  simularMover,
} from "@/test/fakes/calendar";
import * as whatsapp from "@/test/fakes/whatsapp";
import {
  conectarGoogle,
  criarAna,
  criarBruno,
  criarCenarioDeVisitaDaAna,
  criarConcorrente,
  ok,
  sessaoDe,
} from "@/test/fixtures";
import { registrarOptOut } from "./estado-do-assistente";
import {
  concluirConexaoGoogle,
  desconectarGoogle,
  iniciarConexaoGoogle,
  statusDoGoogle,
} from "./google-calendar";
import { buscarNegocio } from "./negocios";
import { sincronizarGoogleCalendar } from "./sincronizar-google-calendar";
import {
  agendarVisita,
  buscarVisita,
  cancelarVisita,
  horariosLivres,
  remarcarVisita,
} from "./visitas";

const segunda8h = new Date("2026-11-02T08:00:00-03:00");
const iso = (d: Date) => d.toISOString();
const stateDa = (url: string) => ok(new URL(url).searchParams.get("state"));

describe("conexão com o Google Calendar", () => {
  test("corretor conecta pelo OAuth e desconecta", async () => {
    setSystemTime(segunda8h);
    const { imobiliaria, corretor } = await criarAna();
    const session = sessaoDe(corretor, imobiliaria);
    expect((await statusDoGoogle(session)).conectado).toBe(false);

    const url = await iniciarConexaoGoogle(session);
    const conectado = await concluirConexaoGoogle(session, {
      code: "codigo-valido",
      state: stateDa(url),
    });

    expect(conectado).toBe(true);
    expect(await statusDoGoogle(session)).toEqual({
      configurado: true,
      conectado: true,
      conectadaEm: segunda8h,
    });

    await desconectarGoogle(session);
    expect((await statusDoGoogle(session)).conectado).toBe(false);
  });

  test("o state do OAuth só vale para o corretor que pediu, uma vez e por 10 minutos", async () => {
    setSystemTime(segunda8h);
    const { imobiliaria, corretor } = await criarAna();
    const ana = sessaoDe(corretor, imobiliaria);
    const bruno = sessaoDe(await criarBruno(imobiliaria), imobiliaria);

    const state = stateDa(await iniciarConexaoGoogle(ana));
    expect(
      await concluirConexaoGoogle(bruno, { code: "codigo-valido", state }),
    ).toBe(false);
    expect((await statusDoGoogle(bruno)).conectado).toBe(false);

    setSystemTime(new Date(segunda8h.getTime() + 11 * 60_000));
    expect(
      await concluirConexaoGoogle(ana, { code: "codigo-valido", state }),
    ).toBe(false);

    const novo = stateDa(await iniciarConexaoGoogle(ana));
    expect(
      await concluirConexaoGoogle(ana, { code: "codigo-valido", state: novo }),
    ).toBe(true);
    // Repetir o callback (recarregar a página) não quebra a conexão.
    expect(
      await concluirConexaoGoogle(ana, { code: "codigo-valido", state: novo }),
    ).toBe(false);
    expect((await statusDoGoogle(ana)).conectado).toBe(true);
  });

  test("código recusado pelo Google não conecta", async () => {
    setSystemTime(segunda8h);
    const { imobiliaria, corretor } = await criarAna();
    const session = sessaoDe(corretor, imobiliaria);
    const state = stateDa(await iniciarConexaoGoogle(session));
    expect(
      await concluirConexaoGoogle(session, { code: "invalido", state }),
    ).toBe(false);
    expect((await statusDoGoogle(session)).conectado).toBe(false);
  });
});

describe("horários livres com o Google conectado", () => {
  test("excluem compromissos do Google", async () => {
    setSystemTime(segunda8h);
    const { session } = await criarCenarioDeVisitaDaAna();
    await conectarGoogle(session);
    simularCompromisso(
      new Date("2026-11-02T09:30:00-03:00"),
      new Date("2026-11-02T10:15:00-03:00"),
    );

    const livres = await horariosLivres(session, {
      aPartirDe: segunda8h,
      dias: 1,
    });

    // 09:00, 09:30 e 10:00 batem com o compromisso das 09:30–10:15.
    expect(livres.map(iso)).toEqual(
      ["10:30", "11:00"].map((h) => iso(new Date(`2026-11-02T${h}:00-03:00`))),
    );
  });

  test("sem Google conectado, usam só a disponibilidade do CRM", async () => {
    setSystemTime(segunda8h);
    const { session } = await criarCenarioDeVisitaDaAna();
    simularCompromisso(
      new Date("2026-11-02T09:30:00-03:00"),
      new Date("2026-11-02T10:15:00-03:00"),
    );

    const livres = await horariosLivres(session, {
      aPartirDe: segunda8h,
      dias: 1,
    });

    expect(livres).toHaveLength(5);
    expect(chamadas.filter((c) => c.fn === "horariosOcupados")).toEqual([]);
  });

  test("Google fora do ar não impede oferecer horários do CRM", async () => {
    setSystemTime(segunda8h);
    const { session } = await criarCenarioDeVisitaDaAna();
    await conectarGoogle(session);
    falhas.ativa = true;

    const livres = await horariosLivres(session, {
      aPartirDe: segunda8h,
      dias: 1,
    });
    expect(livres).toHaveLength(5);
  });
});

describe("visitas no Google Calendar", () => {
  const dez = new Date("2026-11-02T10:00:00-03:00");

  test("visita agendada cria evento com cliente, empreendimento e telefone", async () => {
    setSystemTime(segunda8h);
    const { session, negocio } = await criarCenarioDeVisitaDaAna();
    await conectarGoogle(session);

    const visita = ok(
      await agendarVisita(session, { negocioId: negocio.id, dataHora: dez }),
    );

    const eventoId = ok(visita.eventoCalendarId);
    const evento = ok(eventos.get(eventoId));
    expect(evento.titulo).toContain("Carlos Lima");
    expect(evento.titulo).toContain("Jardim das Flores");
    expect(evento.descricao).toContain("5588999990000");
    expect(evento.inicio).toEqual(dez);
    expect(evento.fim).toEqual(new Date("2026-11-02T11:00:00-03:00"));
    expect((await buscarVisita(session, visita.id))?.eventoCalendarId).toBe(
      eventoId,
    );
  });

  test("repetir o agendamento não duplica o evento", async () => {
    setSystemTime(segunda8h);
    const { session, negocio } = await criarCenarioDeVisitaDaAna();
    await conectarGoogle(session);
    const id = crypto.randomUUID();

    await agendarVisita(session, { id, negocioId: negocio.id, dataHora: dez });
    await agendarVisita(session, { id, negocioId: negocio.id, dataHora: dez });

    expect(eventos.size).toBe(1);
    expect(chamadas.filter((c) => c.fn === "criarEvento")).toHaveLength(1);
  });

  test("remarcar move o evento e cancelar o apaga", async () => {
    setSystemTime(segunda8h);
    const { session, negocio } = await criarCenarioDeVisitaDaAna();
    await conectarGoogle(session);
    const visita = ok(
      await agendarVisita(session, { negocioId: negocio.id, dataHora: dez }),
    );
    const eventoId = ok(visita.eventoCalendarId);

    const onze = new Date("2026-11-03T11:00:00-03:00");
    await remarcarVisita(session, visita.id, { dataHora: onze });
    expect(eventos.get(eventoId)?.inicio).toEqual(onze);

    await cancelarVisita(session, visita.id);
    expect(eventos.get(eventoId)?.removido).toBe(true);
  });

  test("Google fora do ar não impede agendar", async () => {
    setSystemTime(segunda8h);
    const { session, negocio } = await criarCenarioDeVisitaDaAna();
    await conectarGoogle(session);
    falhas.ativa = true;

    const visita = ok(
      await agendarVisita(session, { negocioId: negocio.id, dataHora: dez }),
    );
    expect(visita.estado).toBe("agendada");
    expect(visita.eventoCalendarId).toBeNull();
  });

  test("sem Google conectado, a visita é agendada sem evento", async () => {
    setSystemTime(segunda8h);
    const { session, negocio } = await criarCenarioDeVisitaDaAna();

    const visita = ok(
      await agendarVisita(session, { negocioId: negocio.id, dataHora: dez }),
    );
    expect(visita.eventoCalendarId).toBeNull();
    expect(chamadas).toEqual([]);
  });
});

describe("sincronização com o Google Calendar", () => {
  const dez = new Date("2026-11-02T10:00:00-03:00");

  async function cenarioComVisita() {
    setSystemTime(segunda8h);
    const cenario = await criarCenarioDeVisitaDaAna();
    await conectarGoogle(cenario.session);
    const visita = ok(
      await agendarVisita(cenario.session, {
        negocioId: cenario.negocio.id,
        dataHora: dez,
      }),
    );
    await sincronizarGoogleCalendar(); // primeira leitura: nada mudou
    whatsapp.enviados.length = 0;
    return { ...cenario, visita, eventoId: ok(visita.eventoCalendarId) };
  }

  const textos = () =>
    whatsapp.enviados.flatMap((e) => (e.tipo === "texto" ? [e.texto] : []));

  test("sem alteração no Google, nada muda e ninguém é avisado", async () => {
    const { session, visita } = await cenarioComVisita();
    await sincronizarGoogleCalendar();
    expect(await buscarVisita(session, visita.id)).toEqual(visita);
    expect(whatsapp.enviados).toEqual([]);
  });

  test("evento movido atualiza a visita e avisa o cliente uma vez", async () => {
    const { session, visita, eventoId } = await cenarioComVisita();
    const novo = new Date("2026-11-03T15:00:00-03:00");
    simularMover(eventoId, novo);

    await sincronizarGoogleCalendar();
    await sincronizarGoogleCalendar();

    const atual = ok(await buscarVisita(session, visita.id));
    expect(atual.dataHora).toEqual(novo);
    expect(atual.estado).toBe("remarcada");
    expect(textos()).toHaveLength(1);
    expect(textos()[0]).toContain("15:00");
    expect(whatsapp.enviados[0]?.para).toBe("5588999990000");
    // O evento não é recriado nem mexido de volta.
    expect(eventos.size).toBe(1);
    expect(eventos.get(eventoId)?.inicio).toEqual(novo);
  });

  test("evento apagado cancela a visita e oferece novos horários uma vez", async () => {
    const { session, visita, eventoId } = await cenarioComVisita();
    simularApagar(eventoId);

    await sincronizarGoogleCalendar();
    await sincronizarGoogleCalendar();

    expect((await buscarVisita(session, visita.id))?.estado).toBe("cancelada");
    expect(textos()).toHaveLength(1);
    // Primeiro horário livre depois de agora (08:00 de segunda): 09:00.
    expect(textos()[0]).toContain("09:00");
    expect(eventos.size).toBe(1);
  });

  test("cliente com opt-out não recebe aviso, mas a visita é atualizada", async () => {
    const { session, negocio, visita, eventoId } = await cenarioComVisita();
    const conversaId = ok(
      (await buscarNegocio(session, negocio.id))?.conversa,
    ).id;
    await registrarOptOut(session, conversaId);
    simularApagar(eventoId);

    await sincronizarGoogleCalendar();

    expect((await buscarVisita(session, visita.id))?.estado).toBe("cancelada");
    expect(whatsapp.enviados).toEqual([]);
  });

  test("visita cancelada no CRM não gera aviso quando o Google informa o evento apagado", async () => {
    const { session, visita } = await cenarioComVisita();
    await cancelarVisita(session, visita.id);

    await sincronizarGoogleCalendar();

    expect(whatsapp.enviados).toEqual([]);
  });

  test("evento de outro corretor não mexe nas visitas da Ana", async () => {
    const { session, visita, eventoId } = await cenarioComVisita();
    const { imobiliaria, corretor } = await criarConcorrente();
    await conectarGoogle(sessaoDe(corretor, imobiliaria));
    await desconectarGoogle(session);
    simularApagar(eventoId);

    await sincronizarGoogleCalendar();

    expect((await buscarVisita(session, visita.id))?.estado).toBe("agendada");
    expect(whatsapp.enviados).toEqual([]);
  });
});
