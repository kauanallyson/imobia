import "server-only";
import { type calendar_v3, google } from "googleapis";
import { env } from "@/lib/env";

// Único módulo que conhece o Google Calendar (spec → Integrações). O resto
// do sistema só vê estas funções; em testes o módulo inteiro é trocado por
// src/test/fakes/calendar.ts.

export type TokensGoogle = {
  accessToken: string | null;
  refreshToken: string;
  expiraEm: Date | null;
};

export type Intervalo = { inicio: Date; fim: Date };

export type EventoDeVisita = {
  titulo: string;
  descricao: string;
  local: string;
  inicio: Date;
  fim: Date;
};

export type AlteracaoDeEvento =
  | { tipo: "alterado"; eventoId: string; inicio: Date; fim: Date }
  | { tipo: "removido"; eventoId: string };

export type Alteracoes = {
  alteracoes: AlteracaoDeEvento[];
  proximoSyncToken: string;
};

export class GoogleNaoConfiguradoError extends Error {
  override name = "GoogleNaoConfiguradoError";
}

// O syncToken expirou (410): o chamador descarta o token e refaz a
// sincronização completa.
export class SyncTokenExpiradoError extends Error {
  override name = "SyncTokenExpiradoError";
}

const ESCOPOS = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.freebusy",
];
const FUSO = "America/Sao_Paulo";

export function googleConfigurado() {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

function oauth(tokens?: TokensGoogle) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new GoogleNaoConfiguradoError(
      "GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET não configurados",
    );
  }
  const client = new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    `${env.APP_URL}/api/google/callback`,
  );
  if (tokens) {
    client.setCredentials({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expiry_date: tokens.expiraEm?.getTime() ?? null,
    });
  }
  return client;
}

function calendar(tokens: TokensGoogle) {
  return google.calendar({ version: "v3", auth: oauth(tokens) });
}

function codigo(error: unknown) {
  if (typeof error !== "object" || error === null) return undefined;
  const e = error as { code?: unknown; status?: unknown };
  return Number(e.code ?? e.status);
}

export function urlDeAutorizacao(state: string): string {
  return oauth().generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // garante refresh_token também em reconexões
    scope: ESCOPOS,
    state,
  });
}

export async function trocarCodigo(code: string): Promise<TokensGoogle> {
  const { tokens } = await oauth().getToken(code);
  if (!tokens.refresh_token) {
    throw new Error("O Google não devolveu refresh_token");
  }
  return {
    accessToken: tokens.access_token ?? null,
    refreshToken: tokens.refresh_token,
    expiraEm: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
  };
}

// Novo access token a partir do refresh token.
export async function renovarTokens(
  tokens: TokensGoogle,
): Promise<TokensGoogle> {
  const { credentials } = await oauth(tokens).refreshAccessToken();
  return {
    accessToken: credentials.access_token ?? null,
    refreshToken: credentials.refresh_token ?? tokens.refreshToken,
    expiraEm: credentials.expiry_date
      ? new Date(credentials.expiry_date)
      : null,
  };
}

// Best effort: desconectar no CRM não depende do Google aceitar.
export async function revogarAcesso(tokens: TokensGoogle): Promise<void> {
  await oauth(tokens).revokeToken(tokens.refreshToken);
}

export async function horariosOcupados(
  tokens: TokensGoogle,
  calendarId: string,
  de: Date,
  ate: Date,
): Promise<Intervalo[]> {
  const { data } = await calendar(tokens).freebusy.query({
    requestBody: {
      timeMin: de.toISOString(),
      timeMax: ate.toISOString(),
      timeZone: FUSO,
      items: [{ id: calendarId }],
    },
  });
  const busy = data.calendars?.[calendarId]?.busy ?? [];
  return busy
    .filter((b) => b.start && b.end)
    .map((b) => ({
      inicio: new Date(b.start as string),
      fim: new Date(b.end as string),
    }));
}

function corpo(evento: EventoDeVisita) {
  return {
    summary: evento.titulo,
    description: evento.descricao,
    location: evento.local,
    start: { dateTime: evento.inicio.toISOString(), timeZone: FUSO },
    end: { dateTime: evento.fim.toISOString(), timeZone: FUSO },
  };
}

// `eventoId` é escolhido pelo chamador (base32hex, ex.: o uuid da visita sem
// hífens): repetir a criação não duplica o evento (409 = já existe).
export async function criarEvento(
  tokens: TokensGoogle,
  calendarId: string,
  eventoId: string,
  evento: EventoDeVisita,
): Promise<{ id: string }> {
  try {
    const { data } = await calendar(tokens).events.insert({
      calendarId,
      requestBody: { id: eventoId, ...corpo(evento) },
    });
    return { id: data.id ?? eventoId };
  } catch (error) {
    if (codigo(error) === 409) {
      await atualizarEvento(tokens, calendarId, eventoId, evento);
      return { id: eventoId };
    }
    throw error;
  }
}

export async function atualizarEvento(
  tokens: TokensGoogle,
  calendarId: string,
  eventoId: string,
  evento: EventoDeVisita,
): Promise<void> {
  // status confirmed: "desapaga" um evento com o mesmo id cancelado antes.
  await calendar(tokens).events.patch({
    calendarId,
    eventId: eventoId,
    requestBody: { ...corpo(evento), status: "confirmed" },
  });
}

// Idempotente: evento já apagado (404/410) não é erro.
export async function removerEvento(
  tokens: TokensGoogle,
  calendarId: string,
  eventoId: string,
): Promise<void> {
  try {
    await calendar(tokens).events.delete({ calendarId, eventId: eventoId });
  } catch (error) {
    const c = codigo(error);
    if (c === 404 || c === 410) return;
    throw error;
  }
}

// Eventos alterados ou apagados desde `syncToken`. Sem token, a primeira
// listagem (a partir de agora) só serve para obter o token.
export async function listarAlteracoes(
  tokens: TokensGoogle,
  calendarId: string,
  syncToken: string | null,
): Promise<Alteracoes> {
  const api = calendar(tokens);
  const alteracoes: AlteracaoDeEvento[] = [];
  let pageToken: string | undefined;
  for (;;) {
    let data: calendar_v3.Schema$Events;
    try {
      ({ data } = await api.events.list({
        calendarId,
        showDeleted: true,
        singleEvents: true,
        maxResults: 250,
        pageToken,
        ...(syncToken ? { syncToken } : { timeMin: new Date().toISOString() }),
      }));
    } catch (error) {
      if (codigo(error) === 410) throw new SyncTokenExpiradoError();
      throw error;
    }
    for (const item of data.items ?? []) {
      if (!item.id) continue;
      if (item.status === "cancelled") {
        alteracoes.push({ tipo: "removido", eventoId: item.id });
      } else if (item.start?.dateTime && item.end?.dateTime) {
        alteracoes.push({
          tipo: "alterado",
          eventoId: item.id,
          inicio: new Date(item.start.dateTime),
          fim: new Date(item.end.dateTime),
        });
      }
    }
    if (data.nextPageToken) {
      pageToken = data.nextPageToken;
      continue;
    }
    if (!data.nextSyncToken) throw new Error("Google sem nextSyncToken");
    return { alteracoes, proximoSyncToken: data.nextSyncToken };
  }
}
