import { describe, expect, test } from "bun:test";
import {
  agendaDoFollowUp,
  estaSilencioso,
  followUpDevido,
  proximaJanelaDeEnvio,
} from "./cadencia";

const br = (s: string) => new Date(`${s}-03:00`);
const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;

describe("próxima janela de envio (8h–20h, segunda a sábado, Brasília)", () => {
  test("dentro da janela, é o próprio instante", () => {
    expect(iso(proximaJanelaDeEnvio(br("2026-11-03T10:15:00")))).toBe(
      iso(br("2026-11-03T10:15:00")),
    );
    expect(iso(proximaJanelaDeEnvio(br("2026-11-07T08:00:00")))).toBe(
      iso(br("2026-11-07T08:00:00")),
    );
  });

  test("antes das 8h vai para as 8h do mesmo dia", () => {
    expect(iso(proximaJanelaDeEnvio(br("2026-11-03T06:30:00")))).toBe(
      iso(br("2026-11-03T08:00:00")),
    );
  });

  test("a partir das 20h vai para as 8h do dia seguinte", () => {
    expect(iso(proximaJanelaDeEnvio(br("2026-11-03T20:00:00")))).toBe(
      iso(br("2026-11-04T08:00:00")),
    );
    expect(iso(proximaJanelaDeEnvio(br("2026-11-03T23:59:00")))).toBe(
      iso(br("2026-11-04T08:00:00")),
    );
  });

  test("sábado à noite e domingo vão para segunda às 8h", () => {
    expect(iso(proximaJanelaDeEnvio(br("2026-11-07T21:00:00")))).toBe(
      iso(br("2026-11-09T08:00:00")),
    );
    expect(iso(proximaJanelaDeEnvio(br("2026-11-08T12:00:00")))).toBe(
      iso(br("2026-11-09T08:00:00")),
    );
    expect(iso(proximaJanelaDeEnvio(br("2026-11-08T06:00:00")))).toBe(
      iso(br("2026-11-09T08:00:00")),
    );
  });
});

describe("agenda do follow-up", () => {
  test("1, 3 e 7 dias, depois a cada 2 semanas, até 90 dias de silêncio", () => {
    // Terça, 3/11/2026, 10:00.
    const ultima = br("2026-11-03T10:00:00");
    expect(
      agendaDoFollowUp(ultima).map((p) => [p.sequencia, iso(p.devidoEm)]),
    ).toEqual([
      [1, iso(br("2026-11-04T10:00:00"))], // +1d qua
      [2, iso(br("2026-11-06T10:00:00"))], // +3d sex
      [3, iso(br("2026-11-10T10:00:00"))], // +7d ter
      [4, iso(br("2026-11-24T10:00:00"))], // +21d
      [5, iso(br("2026-12-08T10:00:00"))], // +35d
      [6, iso(br("2026-12-22T10:00:00"))], // +49d
      [7, iso(br("2027-01-05T10:00:00"))], // +63d
      [8, iso(br("2027-01-19T10:00:00"))], // +77d; +91d passaria de 90
    ]);
  });

  test("passo que cai fora da janela vai para a próxima", () => {
    // Sexta, 6/11/2026, 21:00: +1d é sábado 21:00 → segunda 8h; +3d é
    // segunda 21:00 → terça 8h; +7d é sexta 21:00 → sábado 8h.
    const ultima = br("2026-11-06T21:00:00");
    const [p1, p2, p3] = agendaDoFollowUp(ultima);
    expect(iso(p1?.devidoEm)).toBe(iso(br("2026-11-09T08:00:00")));
    expect(iso(p2?.devidoEm)).toBe(iso(br("2026-11-10T08:00:00")));
    expect(iso(p3?.devidoEm)).toBe(iso(br("2026-11-14T08:00:00")));
  });
});

describe("follow-up devido", () => {
  const ultima = br("2026-11-03T10:00:00");

  test("nada antes de 1 dia", () => {
    expect(followUpDevido(ultima, 0, br("2026-11-04T09:59:00"))).toBeNull();
  });

  test("o primeiro passo ainda não enviado cujo horário chegou", () => {
    expect(followUpDevido(ultima, 0, br("2026-11-04T10:00:00"))).toEqual({
      sequencia: 1,
      devidoEm: br("2026-11-04T10:00:00"),
    });
    expect(followUpDevido(ultima, 1, br("2026-11-04T15:00:00"))).toBeNull();
    expect(
      followUpDevido(ultima, 1, br("2026-11-06T10:00:00"))?.sequencia,
    ).toBe(2);
  });

  test("com vários passos atrasados, só o mais recente sai (sem rajada)", () => {
    expect(
      followUpDevido(ultima, 0, br("2026-11-25T09:00:00"))?.sequencia,
    ).toBe(4);
  });

  test("fora da janela nada é devido", () => {
    // Domingo, 8/11: o passo 3 (+7d, terça) ainda não chegou, mas o 2 está
    // atrasado desde sexta; domingo não envia.
    expect(followUpDevido(ultima, 1, br("2026-11-08T10:00:00"))).toBeNull();
    expect(followUpDevido(ultima, 1, br("2026-11-06T20:30:00"))).toBeNull();
  });

  test("depois do último passo, nada mais", () => {
    expect(followUpDevido(ultima, 8, br("2027-02-10T10:00:00"))).toBeNull();
  });
});

describe("silencioso", () => {
  const ultima = br("2026-11-03T10:00:00");
  test("a partir de 90 dias sem mensagem do cliente", () => {
    expect(estaSilencioso(ultima, br("2027-02-01T09:59:00"))).toBe(false);
    expect(estaSilencioso(ultima, br("2027-02-01T10:00:00"))).toBe(true);
  });
});
