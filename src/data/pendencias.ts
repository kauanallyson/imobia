import "server-only";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  clientes,
  negocios,
  pendencias,
  type TipoDePendencia,
  users,
} from "@/lib/db/schema";
import { env } from "@/lib/env";
import * as whatsapp from "@/lib/whatsapp";
import { requireCorretor, type Session } from "./session";

// Pendências (GLOSSARY → Pendência): o que o assistente não resolve sozinho e
// espera o corretor. Escopo pelo corretor dono do negócio. Cada pendência
// gera um único aviso no WhatsApp do corretor pelo número de sistema.

const columns = {
  id: pendencias.id,
  negocioId: pendencias.negocioId,
  tipo: pendencias.tipo,
  descricao: pendencias.descricao,
  estado: pendencias.estado,
  criadaEm: pendencias.criadaEm,
  resolvidaEm: pendencias.resolvidaEm,
  avisoEnviadoEm: pendencias.avisoEnviadoEm,
};

export type Pendencia = {
  id: string;
  negocioId: string;
  tipo: TipoDePendencia;
  descricao: string;
  estado: "aberta" | "resolvida";
  criadaEm: Date;
  resolvidaEm: Date | null;
  avisoEnviadoEm: Date | null;
};

// Tipos avisados a qualquer hora (spec → Avisos ao corretor).
export const tiposUrgentes: readonly TipoDePendencia[] = [
  "cliente_pediu_pessoa",
  "revisar_proposta",
];

export const rotuloDoTipo: Record<TipoDePendencia, string> = {
  revisar_proposta: "Revisar proposta",
  pergunta_sem_resposta: "Pergunta sem resposta",
  cliente_pediu_pessoa: "Cliente pediu uma pessoa",
  pedido_desconto: "Pedido de desconto",
  confirmar_assinatura: "Confirmar assinatura",
  confirmar_pagamento: "Confirmar pagamento",
};

// Chave natural: negócio + tipo + descrição com a pendência ainda aberta (unique
// parcial no banco). Repetir devolve a existente; `id` do chamador só vale na
// primeira criação. Negócio fora do escopo → null. Criada, tenta avisar o
// corretor na hora (o aviso respeita a janela).
export async function criarPendencia(
  session: Session,
  input: {
    id?: string;
    negocioId: string;
    tipo: TipoDePendencia;
    descricao: string;
  },
): Promise<Pendencia | null> {
  const { corretorId, imobiliariaId } = requireCorretor(session);
  if (!z.uuid().safeParse(input.negocioId).success) return null;
  const descricao = input.descricao.trim() || rotuloDoTipo[input.tipo];

  const [negocio] = await db
    .select({ id: negocios.id })
    .from(negocios)
    .where(
      and(
        eq(negocios.id, input.negocioId),
        eq(negocios.corretorId, corretorId),
      ),
    );
  if (!negocio) return null;

  const [created] = await db
    .insert(pendencias)
    .values({
      id: input.id,
      imobiliariaId,
      corretorId,
      negocioId: negocio.id,
      tipo: input.tipo,
      descricao,
      criadaEm: new Date(),
    })
    .onConflictDoNothing()
    .returning(columns);

  if (created) {
    await avisarCorretor(created.id);
    return (await lerPendencia(created.id)) ?? created;
  }
  const [existing] = await db
    .select(columns)
    .from(pendencias)
    .where(
      and(
        eq(pendencias.negocioId, negocio.id),
        eq(pendencias.tipo, input.tipo),
        eq(pendencias.descricao, descricao),
        eq(pendencias.estado, "aberta"),
      ),
    );
  return existing ?? null;
}

async function lerPendencia(id: string) {
  const [found] = await db
    .select(columns)
    .from(pendencias)
    .where(eq(pendencias.id, id));
  return found ?? null;
}

// Abertas primeiro (mais recentes no topo), depois as resolvidas.
export async function listarPendencias(session: Session) {
  const { corretorId } = requireCorretor(session);
  return db
    .select({
      ...columns,
      clienteNome: clientes.nome,
    })
    .from(pendencias)
    .innerJoin(negocios, eq(negocios.id, pendencias.negocioId))
    .innerJoin(clientes, eq(clientes.id, negocios.clienteId))
    .where(eq(pendencias.corretorId, corretorId))
    .orderBy(
      asc(sql`case when ${pendencias.estado} = 'aberta' then 0 else 1 end`),
      desc(pendencias.criadaEm),
    );
}

export type PendenciaListada = Awaited<
  ReturnType<typeof listarPendencias>
>[number];

export async function buscarPendencia(session: Session, id: string) {
  const { corretorId } = requireCorretor(session);
  if (!z.uuid().safeParse(id).success) return null;
  const [found] = await db
    .select({
      ...columns,
      clienteNome: clientes.nome,
      clienteTelefone: clientes.telefone,
    })
    .from(pendencias)
    .innerJoin(negocios, eq(negocios.id, pendencias.negocioId))
    .innerJoin(clientes, eq(clientes.id, negocios.clienteId))
    .where(and(eq(pendencias.id, id), eq(pendencias.corretorId, corretorId)));
  return found ?? null;
}

// "Levar a resolvida": já resolvida, nada muda. Fora do escopo → null.
export async function resolverPendencia(
  session: Session,
  id: string,
): Promise<Pendencia | null> {
  const { corretorId } = requireCorretor(session);
  if (!z.uuid().safeParse(id).success) return null;
  const agora = new Date();
  const [updated] = await db
    .update(pendencias)
    .set({ estado: "resolvida", resolvidaEm: agora })
    .where(
      and(
        eq(pendencias.id, id),
        eq(pendencias.corretorId, corretorId),
        eq(pendencias.estado, "aberta"),
      ),
    )
    .returning(columns);
  if (updated) return updated;
  const [found] = await db
    .select(columns)
    .from(pendencias)
    .where(and(eq(pendencias.id, id), eq(pendencias.corretorId, corretorId)));
  return found ?? null;
}

// --- Avisos ao corretor ------------------------------------------------------

// 8h–20h, segunda a sábado, horário de Brasília (spec → Horário).
export function dentroDaJanelaDeAvisos(agora: Date): boolean {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    hour: "numeric",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(agora);
  const hora = Number(partes.find((p) => p.type === "hour")?.value);
  const dia = partes.find((p) => p.type === "weekday")?.value;
  return dia !== "Sun" && hora >= 8 && hora < 20;
}

export function textoDoAviso(pendencia: {
  id: string;
  tipo: TipoDePendencia;
  descricao: string;
  clienteNome: string;
}) {
  const link = `${env.APP_URL}/painel/pendencias/${pendencia.id}`;
  const abertura: Record<TipoDePendencia, string> = {
    cliente_pediu_pessoa: `${pendencia.clienteNome} pediu para falar com você. O assistente pausou a conversa.`,
    pergunta_sem_resposta: `${pendencia.clienteNome} fez uma pergunta que não está na base de conhecimento.`,
    pedido_desconto: `${pendencia.clienteNome} pediu desconto ou negociação de condições.`,
    revisar_proposta: `A proposta de ${pendencia.clienteNome} está pronta para a sua revisão.`,
    confirmar_assinatura: `${pendencia.clienteNome} enviou a proposta assinada: confirme a assinatura.`,
    confirmar_pagamento: `${pendencia.clienteNome} enviou o comprovante: confirme o pagamento.`,
  };
  return [
    `loteAI · ${rotuloDoTipo[pendencia.tipo]}`,
    abertura[pendencia.tipo],
    pendencia.descricao,
    `Resolver: ${link}`,
  ].join("\n");
}

// Manda ao corretor, pelo número de sistema, o aviso de uma pendência aberta
// ainda não avisada. Tipos urgentes saem a qualquer hora; os demais só dentro
// da janela (fora dela ficam para `enviarAvisosPendentes`). Corretor sem
// telefone não é avisado. O aviso é reivindicado antes do envio: dois
// processos simultâneos não mandam dois; falha no envio libera para o job.
export async function avisarCorretor(pendenciaId: string): Promise<boolean> {
  const agora = new Date();
  const [alvo] = await db
    .select({
      id: pendencias.id,
      tipo: pendencias.tipo,
      descricao: pendencias.descricao,
      clienteNome: clientes.nome,
      telefone: users.telefone,
    })
    .from(pendencias)
    .innerJoin(negocios, eq(negocios.id, pendencias.negocioId))
    .innerJoin(clientes, eq(clientes.id, negocios.clienteId))
    .innerJoin(users, eq(users.id, pendencias.corretorId))
    .where(
      and(
        eq(pendencias.id, pendenciaId),
        eq(pendencias.estado, "aberta"),
        isNull(pendencias.avisoEnviadoEm),
      ),
    );
  if (!alvo || !alvo.telefone) return false;
  if (!tiposUrgentes.includes(alvo.tipo) && !dentroDaJanelaDeAvisos(agora)) {
    return false;
  }

  const [reivindicada] = await db
    .update(pendencias)
    .set({ avisoEnviadoEm: agora })
    .where(and(eq(pendencias.id, alvo.id), isNull(pendencias.avisoEnviadoEm)))
    .returning({ id: pendencias.id });
  if (!reivindicada) return false;

  try {
    await whatsapp.enviarTextoDoSistema(alvo.telefone, textoDoAviso(alvo));
    return true;
  } catch (error) {
    console.error("pendências: falha ao avisar o corretor", error);
    await db
      .update(pendencias)
      .set({ avisoEnviadoEm: null })
      .where(eq(pendencias.id, alvo.id));
    return false;
  }
}

// Job do worker (a cada minuto): avisa as pendências abertas que ainda
// esperam (fora da janela na criação, corretor sem telefone, falha de envio).
export async function enviarAvisosPendentes(): Promise<number> {
  const espera = await db
    .select({ id: pendencias.id })
    .from(pendencias)
    .where(
      and(eq(pendencias.estado, "aberta"), isNull(pendencias.avisoEnviadoEm)),
    )
    .orderBy(asc(pendencias.criadaEm));
  let enviados = 0;
  for (const { id } of espera) {
    if (await avisarCorretor(id)) enviados++;
  }
  return enviados;
}
