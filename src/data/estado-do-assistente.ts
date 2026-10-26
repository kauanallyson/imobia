import "server-only";
import { and, eq, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { conversas, type EstadoDoAssistente } from "@/lib/db/schema";
import { marcarPerdido } from "./negocios";
import { requireCorretor, type Session } from "./session";

// Estado do assistente por conversa (spec → Assistente → Pausa; ticket 10).
// Fica num módulo próprio (re-exportado por `conversas.ts`) para que as
// ferramentas do assistente possam importá-lo sem ciclo com `assistente.ts`.
//
// Máquina de estados: `ativo` ⇄ `pausado` (mensagem `fromMe` do corretor /
// devolver ou 24h) e `ativo` ⇄ `desligado` (botão do corretor). Opt-out do
// cliente é definitivo: a conversa fica `desligado` + `optOut` e nenhuma
// função daqui a religa.

export const conversaColumns = {
  id: conversas.id,
  clienteId: conversas.clienteId,
  assistente: conversas.assistente,
  ultimaMensagemCorretorEm: conversas.ultimaMensagemCorretorEm,
  optOut: conversas.optOut,
};

// Quanto tempo sem mensagem do corretor até o assistente retomar sozinho
// (história 77).
export const RETOMADA_APOS_MS = 24 * 60 * 60 * 1000;

export async function buscarConversa(session: Session, conversaId: string) {
  const { corretorId } = requireCorretor(session);
  if (!z.uuid().safeParse(conversaId).success) return null;
  const [found] = await db
    .select(conversaColumns)
    .from(conversas)
    .where(
      and(eq(conversas.id, conversaId), eq(conversas.corretorId, corretorId)),
    );
  return found ?? null;
}

// "Levar ao estado X": repetir não altera; opt-out nunca volta a `ativo`.
async function levarAssistenteA(
  session: Session,
  conversaId: string,
  estado: EstadoDoAssistente,
) {
  const { corretorId } = requireCorretor(session);
  if (!z.uuid().safeParse(conversaId).success) return null;
  return db.transaction(async (tx) => {
    const [atual] = await tx
      .select(conversaColumns)
      .from(conversas)
      .where(
        and(eq(conversas.id, conversaId), eq(conversas.corretorId, corretorId)),
      )
      .for("update");
    if (!atual) return null;
    if (atual.optOut || atual.assistente === estado) return atual;
    const [alterada] = await tx
      .update(conversas)
      .set({ assistente: estado })
      .where(eq(conversas.id, conversaId))
      .returning(conversaColumns);
    return alterada ?? null;
  });
}

// História 76: o corretor devolve a conversa pausada ao assistente.
export function devolverAoAssistente(session: Session, conversaId: string) {
  return levarAssistenteA(session, conversaId, "ativo");
}

export function ligarAssistente(session: Session, conversaId: string) {
  return levarAssistenteA(session, conversaId, "ativo");
}

// Desligado não retoma sozinho: só o corretor religa.
export function desligarAssistente(session: Session, conversaId: string) {
  return levarAssistenteA(session, conversaId, "desligado");
}

// Job do worker (história 77): conversas pausadas voltam a `ativo` 24h depois
// do mais recente entre a pausa e a última mensagem do corretor (a pausa por
// `chamar_corretor` não tem mensagem do corretor). Devolve quantas retomou.
export async function retomarAssistentesPausados(): Promise<number> {
  const limite = new Date(Date.now() - RETOMADA_APOS_MS);
  const retomadas = await db
    .update(conversas)
    .set({ assistente: "ativo" })
    .where(
      and(
        eq(conversas.assistente, "pausado"),
        eq(conversas.optOut, false),
        lt(
          sql`greatest(${conversas.pausadoEm}, ${conversas.ultimaMensagemCorretorEm})`,
          limite,
        ),
      ),
    )
    .returning({ id: conversas.id });
  return retomadas.length;
}

// Opt-out (spec → Follow-up): o cliente pediu para não receber mais nada.
// A conversa fica desligada em definitivo e todo negócio aberto do cliente
// com este corretor vai a Perdido com motivo "sem interesse". Idempotente.
export async function registrarOptOut(
  session: Session,
  conversaId: string,
  opcoes: { negocioId?: string; autor?: "assistente" | "corretor" } = {},
) {
  const { corretorId } = requireCorretor(session);
  if (!z.uuid().safeParse(conversaId).success) return null;
  const [conversa] = await db
    .update(conversas)
    .set({ assistente: "desligado", optOut: true })
    .where(
      and(eq(conversas.id, conversaId), eq(conversas.corretorId, corretorId)),
    )
    .returning(conversaColumns);
  if (!conversa) return null;
  if (opcoes.negocioId) {
    await marcarPerdido(session, opcoes.negocioId, "sem interesse", {
      autor: opcoes.autor ?? "assistente",
    });
  }
  return conversa;
}
