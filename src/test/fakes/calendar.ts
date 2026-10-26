import type {
  AlteracaoDeEvento,
  Alteracoes,
  EventoDeVisita,
  Intervalo,
  TokensGoogle,
} from "@/lib/calendar";

// Falso em memória de src/lib/calendar.ts: mesma superfície, mais helpers
// para o teste montar compromissos, simular o corretor mexendo no Google e
// inspecionar chamadas. Trocado pelo preload (src/test/fakes/preload.ts).
// Um único calendário falso, compartilhado por qualquer token.

export class GoogleNaoConfiguradoError extends Error {
  override name = "GoogleNaoConfiguradoError";
}
export class SyncTokenExpiradoError extends Error {
  override name = "SyncTokenExpiradoError";
}

export type EventoFalso = EventoDeVisita & {
  id: string;
  calendarId: string;
  removido: boolean;
};

export const eventos = new Map<string, EventoFalso>();
// Compromissos do corretor que não são visitas (só aparecem no freebusy).
export const ocupados: Intervalo[] = [];
export const chamadas: Array<{ fn: string; eventoId?: string }> = [];
// Liga para simular o Google fora do ar.
export const falhas = { ativa: false };

// Histórico de alterações: o syncToken é a posição neste log.
let log: AlteracaoDeEvento[] = [];

export function limpar() {
  eventos.clear();
  ocupados.length = 0;
  chamadas.length = 0;
  falhas.ativa = false;
  log = [];
}

function falharSeAtivo() {
  if (falhas.ativa) throw new Error("google falso fora do ar");
}

export function googleConfigurado() {
  return true;
}

export function urlDeAutorizacao(state: string): string {
  return `https://accounts.google.test/o/oauth2/auth?state=${state}`;
}

// Código "codigo-valido" (ou qualquer um que não comece com "invalido") vira
// tokens; "invalido..." falha como o Google.
export async function trocarCodigo(code: string): Promise<TokensGoogle> {
  chamadas.push({ fn: "trocarCodigo" });
  if (code.startsWith("invalido")) throw new Error("invalid_grant");
  return {
    accessToken: `access-${code}`,
    refreshToken: `refresh-${code}`,
    expiraEm: new Date(Date.now() + 3600_000),
  };
}

export async function renovarTokens(
  tokens: TokensGoogle,
): Promise<TokensGoogle> {
  chamadas.push({ fn: "renovarTokens" });
  return {
    ...tokens,
    accessToken: `${tokens.refreshToken}-renovado`,
    expiraEm: new Date(Date.now() + 3600_000),
  };
}

export async function revogarAcesso(_tokens: TokensGoogle): Promise<void> {
  chamadas.push({ fn: "revogarAcesso" });
}

export async function horariosOcupados(
  _tokens: TokensGoogle,
  _calendarId: string,
  de: Date,
  ate: Date,
): Promise<Intervalo[]> {
  chamadas.push({ fn: "horariosOcupados" });
  falharSeAtivo();
  const daAgenda = [...eventos.values()]
    .filter((e) => !e.removido)
    .map((e) => ({ inicio: e.inicio, fim: e.fim }));
  return [...ocupados, ...daAgenda].filter((b) => b.inicio < ate && de < b.fim);
}

export async function criarEvento(
  _tokens: TokensGoogle,
  calendarId: string,
  eventoId: string,
  evento: EventoDeVisita,
): Promise<{ id: string }> {
  chamadas.push({ fn: "criarEvento", eventoId });
  falharSeAtivo();
  eventos.set(eventoId, {
    ...evento,
    id: eventoId,
    calendarId,
    removido: false,
  });
  log.push({
    tipo: "alterado",
    eventoId,
    inicio: evento.inicio,
    fim: evento.fim,
  });
  return { id: eventoId };
}

export async function atualizarEvento(
  _tokens: TokensGoogle,
  calendarId: string,
  eventoId: string,
  evento: EventoDeVisita,
): Promise<void> {
  chamadas.push({ fn: "atualizarEvento", eventoId });
  falharSeAtivo();
  eventos.set(eventoId, {
    ...evento,
    id: eventoId,
    calendarId,
    removido: false,
  });
  log.push({
    tipo: "alterado",
    eventoId,
    inicio: evento.inicio,
    fim: evento.fim,
  });
}

export async function removerEvento(
  _tokens: TokensGoogle,
  _calendarId: string,
  eventoId: string,
): Promise<void> {
  chamadas.push({ fn: "removerEvento", eventoId });
  falharSeAtivo();
  const evento = eventos.get(eventoId);
  if (!evento || evento.removido) return;
  evento.removido = true;
  log.push({ tipo: "removido", eventoId });
}

export async function listarAlteracoes(
  _tokens: TokensGoogle,
  _calendarId: string,
  syncToken: string | null,
): Promise<Alteracoes> {
  chamadas.push({ fn: "listarAlteracoes" });
  falharSeAtivo();
  const desde = syncToken ? Number(syncToken.replace("sync-", "")) : 0;
  if (Number.isNaN(desde) || desde > log.length) {
    throw new SyncTokenExpiradoError();
  }
  // Como o Google: só o estado atual de cada evento alterado desde o token.
  const ultimas = new Map<string, AlteracaoDeEvento>();
  for (const a of log.slice(desde)) {
    ultimas.delete(a.eventoId);
    ultimas.set(a.eventoId, a);
  }
  return {
    alteracoes: [...ultimas.values()],
    proximoSyncToken: `sync-${log.length}`,
  };
}

// --- O corretor mexendo direto no Google ------------------------------------

export function simularMover(eventoId: string, inicio: Date) {
  const evento = eventos.get(eventoId);
  if (!evento) throw new Error(`calendar falso: sem evento ${eventoId}`);
  const fim = new Date(
    inicio.getTime() + (evento.fim.getTime() - evento.inicio.getTime()),
  );
  Object.assign(evento, { inicio, fim });
  log.push({ tipo: "alterado", eventoId, inicio, fim });
}

export function simularApagar(eventoId: string) {
  const evento = eventos.get(eventoId);
  if (!evento) throw new Error(`calendar falso: sem evento ${eventoId}`);
  evento.removido = true;
  log.push({ tipo: "removido", eventoId });
}

export function simularCompromisso(inicio: Date, fim: Date) {
  ocupados.push({ inicio, fim });
}
