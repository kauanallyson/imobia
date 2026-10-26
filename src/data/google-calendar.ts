import "server-only";
import { and, eq, gt, isNotNull } from "drizzle-orm";
import * as calendar from "@/lib/calendar";
import { db } from "@/lib/db";
import {
  clientes,
  empreendimentos,
  googleCalendarConexoes,
  negocios,
  visitas,
} from "@/lib/db/schema";
import { requireCorretor, type Session } from "./session";

// Google Calendar do corretor (ticket 14). Opcional: sem conexão, a agenda
// usa só a disponibilidade do CRM. Falhas do Google nunca bloqueiam o
// agendamento; ficam no log.

const VALIDADE_DO_STATE_MS = 10 * 60_000;
// Mesma duração de src/data/visitas.ts (não importado para evitar ciclo).
const DURACAO_DA_VISITA_MS = 60 * 60_000;

export type StatusDoGoogle = {
  configurado: boolean;
  conectado: boolean;
  conectadaEm: Date | null;
};

export async function statusDoGoogle(
  session: Session,
): Promise<StatusDoGoogle> {
  const { corretorId } = requireCorretor(session);
  const [conexao] = await db
    .select({
      refreshToken: googleCalendarConexoes.refreshToken,
      conectadaEm: googleCalendarConexoes.conectadaEm,
    })
    .from(googleCalendarConexoes)
    .where(eq(googleCalendarConexoes.corretorId, corretorId));
  const conectado = Boolean(conexao?.refreshToken);
  return {
    configurado: calendar.googleConfigurado(),
    conectado,
    conectadaEm: conectado ? (conexao?.conectadaEm ?? null) : null,
  };
}

// Gera o state do OAuth, guardado na linha do corretor, e devolve a URL de
// consentimento do Google. Pedir de novo troca o state.
export async function iniciarConexaoGoogle(session: Session): Promise<string> {
  const { corretorId, imobiliariaId } = requireCorretor(session);
  const state = crypto.randomUUID();
  const agora = new Date();
  const expira = new Date(agora.getTime() + VALIDADE_DO_STATE_MS);
  await db
    .insert(googleCalendarConexoes)
    .values({
      corretorId,
      imobiliariaId,
      estadoOauth: state,
      estadoOauthExpiraEm: expira,
      atualizadaEm: agora,
    })
    .onConflictDoUpdate({
      target: googleCalendarConexoes.corretorId,
      set: {
        estadoOauth: state,
        estadoOauthExpiraEm: expira,
        atualizadaEm: agora,
      },
    });
  return calendar.urlDeAutorizacao(state);
}

// Callback do OAuth: o state precisa ser o que este corretor pediu, ainda
// válido. Consome o state (repetir o callback devolve false sem desfazer a
// conexão). Código recusado pelo Google → false.
export async function concluirConexaoGoogle(
  session: Session,
  input: { code: string; state: string },
): Promise<boolean> {
  const { corretorId } = requireCorretor(session);
  if (!input.state || !input.code) return false;
  const [consumido] = await db
    .update(googleCalendarConexoes)
    .set({ estadoOauth: null, estadoOauthExpiraEm: null })
    .where(
      and(
        eq(googleCalendarConexoes.corretorId, corretorId),
        eq(googleCalendarConexoes.estadoOauth, input.state),
        gt(googleCalendarConexoes.estadoOauthExpiraEm, new Date()),
      ),
    )
    .returning({ corretorId: googleCalendarConexoes.corretorId });
  if (!consumido) return false;

  let tokens: calendar.TokensGoogle;
  try {
    tokens = await calendar.trocarCodigo(input.code);
  } catch (error) {
    console.error("[google] troca do código falhou", error);
    return false;
  }
  const agora = new Date();
  await db
    .update(googleCalendarConexoes)
    .set({
      refreshToken: tokens.refreshToken,
      accessToken: tokens.accessToken,
      tokenExpiraEm: tokens.expiraEm,
      syncToken: null,
      conectadaEm: agora,
      atualizadaEm: agora,
    })
    .where(eq(googleCalendarConexoes.corretorId, corretorId));
  return true;
}

// "Levar a desconectado": apaga tokens e posição de sincronização; revogar
// no Google é best effort.
export async function desconectarGoogle(session: Session): Promise<void> {
  const { corretorId } = requireCorretor(session);
  const [removida] = await db
    .delete(googleCalendarConexoes)
    .where(eq(googleCalendarConexoes.corretorId, corretorId))
    .returning();
  if (!removida?.refreshToken) return;
  try {
    await calendar.revogarAcesso(tokensDe(removida));
  } catch (error) {
    console.error("[google] revogação falhou", error);
  }
}

// --- Uso interno (visitas e sincronização) ----------------------------------

type Conexao = typeof googleCalendarConexoes.$inferSelect;

function tokensDe(conexao: Conexao): calendar.TokensGoogle {
  return {
    accessToken: conexao.accessToken,
    refreshToken: conexao.refreshToken ?? "",
    expiraEm: conexao.tokenExpiraEm,
  };
}

export type CalendarioDoCorretor = {
  corretorId: string;
  tokens: calendar.TokensGoogle;
  calendarId: string;
  syncToken: string | null;
};

// Credenciais prontas para uso (renova o access token perto de expirar e
// persiste); null se o corretor não conectou o Google.
export async function calendarioDoCorretor(
  corretorId: string,
): Promise<CalendarioDoCorretor | null> {
  const [conexao] = await db
    .select()
    .from(googleCalendarConexoes)
    .where(
      and(
        eq(googleCalendarConexoes.corretorId, corretorId),
        isNotNull(googleCalendarConexoes.refreshToken),
      ),
    );
  if (!conexao) return null;
  let tokens = tokensDe(conexao);
  if (!tokens.expiraEm || tokens.expiraEm.getTime() - Date.now() < 60_000) {
    tokens = await calendar.renovarTokens(tokens);
    await db
      .update(googleCalendarConexoes)
      .set({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiraEm: tokens.expiraEm,
      })
      .where(eq(googleCalendarConexoes.corretorId, corretorId));
  }
  return {
    corretorId,
    tokens,
    calendarId: conexao.calendarId,
    syncToken: conexao.syncToken,
  };
}

export async function corretoresComGoogle(): Promise<string[]> {
  const rows = await db
    .select({ corretorId: googleCalendarConexoes.corretorId })
    .from(googleCalendarConexoes)
    .where(isNotNull(googleCalendarConexoes.refreshToken));
  return rows.map((r) => r.corretorId);
}

export async function salvarSyncToken(
  corretorId: string,
  syncToken: string | null,
) {
  await db
    .update(googleCalendarConexoes)
    .set({ syncToken })
    .where(eq(googleCalendarConexoes.corretorId, corretorId));
}

// Compromissos do Google entre `de` e `ate`; sem conexão ou com o Google
// fora do ar, nenhum (a agenda segue só com o CRM).
export async function ocupadosNoGoogle(
  corretorId: string,
  de: Date,
  ate: Date,
): Promise<calendar.Intervalo[]> {
  try {
    const cal = await calendarioDoCorretor(corretorId);
    if (!cal) return [];
    return await calendar.horariosOcupados(cal.tokens, cal.calendarId, de, ate);
  } catch (error) {
    console.error("[google] consulta de horários ocupados falhou", error);
    return [];
  }
}

// O id do evento é o da visita sem hífens (base32hex válido): criar de novo
// não duplica.
const eventoIdDa = (visitaId: string) => visitaId.replaceAll("-", "");

// Leva o evento do Google ao estado da visita: ativa → evento criado ou
// atualizado (horário, local, cliente; anonimizado depois da exclusão LGPD);
// cancelada → evento apagado. Grava
// e devolve o `eventoCalendarId`. Sem Google conectado não faz nada; falha
// do Google só vai para o log (o agendamento já valeu).
export async function refletirVisitaNoGoogle(
  visitaId: string,
): Promise<string | null> {
  const [visita] = await db
    .select({
      id: visitas.id,
      corretorId: visitas.corretorId,
      dataHora: visitas.dataHora,
      local: visitas.local,
      estado: visitas.estado,
      eventoCalendarId: visitas.eventoCalendarId,
      clienteNome: clientes.nome,
      telefone: clientes.telefone,
      anonimizadoEm: clientes.anonimizadoEm,
      empreendimento: empreendimentos.nome,
    })
    .from(visitas)
    .innerJoin(negocios, eq(negocios.id, visitas.negocioId))
    .innerJoin(clientes, eq(clientes.id, negocios.clienteId))
    .leftJoin(
      empreendimentos,
      eq(empreendimentos.id, negocios.empreendimentoInteresseId),
    )
    .where(eq(visitas.id, visitaId));
  if (!visita) return null;
  try {
    const cal = await calendarioDoCorretor(visita.corretorId);
    if (!cal) return visita.eventoCalendarId;
    if (visita.estado === "cancelada") {
      if (visita.eventoCalendarId) {
        await calendar.removerEvento(
          cal.tokens,
          cal.calendarId,
          visita.eventoCalendarId,
        );
      }
      return visita.eventoCalendarId;
    }
    const evento: calendar.EventoDeVisita = {
      titulo: `Visita: ${visita.clienteNome}${visita.empreendimento ? ` — ${visita.empreendimento}` : ""}`,
      descricao: [
        `Cliente: ${visita.clienteNome}`,
        // Cliente anonimizado (LGPD): o evento fica, sem o telefone.
        visita.anonimizadoEm ? "" : `Telefone: +${visita.telefone}`,
        visita.empreendimento ? `Empreendimento: ${visita.empreendimento}` : "",
        "Agendada pelo loteAI.",
      ]
        .filter(Boolean)
        .join("\n"),
      local: visita.local,
      inicio: visita.dataHora,
      fim: new Date(visita.dataHora.getTime() + DURACAO_DA_VISITA_MS),
    };
    if (visita.eventoCalendarId) {
      await calendar.atualizarEvento(
        cal.tokens,
        cal.calendarId,
        visita.eventoCalendarId,
        evento,
      );
      return visita.eventoCalendarId;
    }
    const { id } = await calendar.criarEvento(
      cal.tokens,
      cal.calendarId,
      eventoIdDa(visita.id),
      evento,
    );
    await db
      .update(visitas)
      .set({ eventoCalendarId: id })
      .where(eq(visitas.id, visita.id));
    return id;
  } catch (error) {
    console.error(`[google] evento da visita ${visita.id} falhou`, error);
    return visita.eventoCalendarId;
  }
}
