import "server-only";
import { and, eq, inArray, ne } from "drizzle-orm";
import * as calendar from "@/lib/calendar";
import { db } from "@/lib/db";
import {
  clientes,
  conversas,
  negocios,
  users,
  visitas,
  whatsappConexoes,
} from "@/lib/db/schema";
import { formatoDataHoraBrasilia } from "@/lib/fuso";
import {
  type ContextoDoAtendimento,
  enviarTextoAoCliente,
  gravarMensagemDoAssistente,
  OptOutError,
} from "./assistente/contexto";
import {
  calendarioDoCorretor,
  corretoresComGoogle,
  salvarSyncToken,
} from "./google-calendar";
import type { Session } from "./session";
import { horariosLivres } from "./visitas";

// Ticket 14: o worker lê o que mudou no Google Calendar de cada corretor
// conectado (syncToken). Evento de visita movido → a visita vai para o novo
// horário (Remarcada) e o assistente avisa o cliente; evento apagado → a
// visita é Cancelada e o assistente oferece novos horários. Idempotente: cada
// mudança é "levar a visita ao estado X" com update condicional, e só quem
// mudou a linha avisa; o syncToken só avança depois de processar.

const ATIVAS = ["agendada", "remarcada"] as const;
const OPCOES_OFERECIDAS = 3;
const quando = (d: Date) => formatoDataHoraBrasilia.format(d);

export async function sincronizarGoogleCalendar(): Promise<{
  movidas: number;
  canceladas: number;
}> {
  const total = { movidas: 0, canceladas: 0 };
  for (const corretorId of await corretoresComGoogle()) {
    try {
      const r = await sincronizarCorretor(corretorId);
      total.movidas += r.movidas;
      total.canceladas += r.canceladas;
    } catch (error) {
      console.error(`[google] sincronização do corretor ${corretorId}`, error);
    }
  }
  return total;
}

async function sincronizarCorretor(corretorId: string) {
  const resultado = { movidas: 0, canceladas: 0 };
  const cal = await calendarioDoCorretor(corretorId);
  if (!cal) return resultado;
  let lote: calendar.Alteracoes;
  try {
    lote = await calendar.listarAlteracoes(
      cal.tokens,
      cal.calendarId,
      cal.syncToken,
    );
  } catch (error) {
    if (!(error instanceof calendar.SyncTokenExpiradoError)) throw error;
    lote = await calendar.listarAlteracoes(cal.tokens, cal.calendarId, null);
  }

  for (const alteracao of lote.alteracoes) {
    if (alteracao.tipo === "removido") {
      if (await cancelarPeloGoogle(corretorId, alteracao.eventoId)) {
        resultado.canceladas++;
      }
    } else if (
      await moverPeloGoogle(corretorId, alteracao.eventoId, alteracao.inicio)
    ) {
      resultado.movidas++;
    }
  }
  await salvarSyncToken(corretorId, lote.proximoSyncToken);
  return resultado;
}

const visitaColumns = {
  id: visitas.id,
  imobiliariaId: visitas.imobiliariaId,
  corretorId: visitas.corretorId,
  negocioId: visitas.negocioId,
  dataHora: visitas.dataHora,
  local: visitas.local,
};
type VisitaSincronizada = {
  [K in keyof typeof visitaColumns]: (typeof visitas.$inferSelect)[K];
};

async function moverPeloGoogle(
  corretorId: string,
  eventoId: string,
  inicio: Date,
) {
  let movida: VisitaSincronizada | undefined;
  try {
    [movida] = await db
      .update(visitas)
      .set({ dataHora: inicio, estado: "remarcada", atualizadaEm: new Date() })
      .where(
        and(
          eq(visitas.corretorId, corretorId),
          eq(visitas.eventoCalendarId, eventoId),
          inArray(visitas.estado, [...ATIVAS]),
          ne(visitas.dataHora, inicio),
        ),
      )
      .returning(visitaColumns);
  } catch (error) {
    // Unique (corretor, horário, ativa): outra visita já ocupa o horário.
    if (!isUniqueViolation(error)) throw error;
    console.error(`[google] evento ${eventoId} movido para horário ocupado`);
    return false;
  }
  if (!movida) return false;
  await avisarCliente(
    movida,
    `Sua visita mudou de horário: agora é ${quando(movida.dataHora)}. Local: ${movida.local}. Se não puder nesse horário, é só me avisar que remarcamos.`,
  );
  return true;
}

async function cancelarPeloGoogle(corretorId: string, eventoId: string) {
  const [cancelada] = await db
    .update(visitas)
    .set({ estado: "cancelada", atualizadaEm: new Date() })
    .where(
      and(
        eq(visitas.corretorId, corretorId),
        eq(visitas.eventoCalendarId, eventoId),
        inArray(visitas.estado, [...ATIVAS]),
      ),
    )
    .returning(visitaColumns);
  if (!cancelada) return false;

  const session: Session = {
    role: "corretor",
    corretorId,
    imobiliariaId: cancelada.imobiliariaId,
  };
  const livres = (
    await horariosLivres(session, { aPartirDe: new Date(), dias: 7 })
  ).slice(0, OPCOES_OFERECIDAS);
  const oferta =
    livres.length > 0
      ? `Posso remarcar para um destes horários: ${livres.map(quando).join("; ")}. Qual fica melhor para você?`
      : "Já já te passo novas opções de horário.";
  await avisarCliente(
    cancelada,
    `Precisamos desmarcar sua visita de ${quando(cancelada.dataHora)}. ${oferta}`,
  );
  return true;
}

// Envio pelo WhatsApp do corretor, pelos helpers do assistente (respeitam o
// opt-out) e gravado na conversa. Sem conversa, sem WhatsApp pareado ou com
// opt-out: só a visita muda.
async function avisarCliente(visita: VisitaSincronizada, texto: string) {
  const [row] = await db
    .select({
      conversaId: conversas.id,
      telefone: clientes.telefone,
      instancia: whatsappConexoes.instancia,
      corretorNome: users.name,
    })
    .from(negocios)
    .innerJoin(clientes, eq(clientes.id, negocios.clienteId))
    .innerJoin(users, eq(users.id, negocios.corretorId))
    .innerJoin(
      conversas,
      and(
        eq(conversas.clienteId, negocios.clienteId),
        eq(conversas.corretorId, negocios.corretorId),
      ),
    )
    .innerJoin(
      whatsappConexoes,
      eq(whatsappConexoes.corretorId, negocios.corretorId),
    )
    .where(eq(negocios.id, visita.negocioId));
  if (!row?.instancia) return;
  const [negocio] = await db
    .select({
      id: negocios.id,
      etapa: negocios.etapa,
      interesse: negocios.interesse,
      empreendimentoInteresseId: negocios.empreendimentoInteresseId,
      loteInteresseId: negocios.loteInteresseId,
    })
    .from(negocios)
    .where(eq(negocios.id, visita.negocioId));
  if (!negocio) return;

  const contexto: ContextoDoAtendimento = {
    session: {
      role: "corretor",
      corretorId: visita.corretorId,
      imobiliariaId: visita.imobiliariaId,
    },
    instancia: row.instancia,
    corretor: { nome: row.corretorNome },
    conversa: { id: row.conversaId, telefone: row.telefone },
    negocio,
  };
  try {
    const { idMensagem } = await enviarTextoAoCliente(contexto, texto);
    await gravarMensagemDoAssistente(contexto, { idMensagem, texto });
  } catch (error) {
    if (error instanceof OptOutError) return;
    console.error(`[google] aviso ao cliente da visita ${visita.id}`, error);
  }
}

function isUniqueViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

// Para src/worker/jobs.ts.
export const jobDoGoogleCalendar = {
  nome: "google-calendar",
  executar: sincronizarGoogleCalendar,
};
