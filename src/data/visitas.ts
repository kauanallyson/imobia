import "server-only";
import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  type AutorDeEtapa,
  clientes,
  conversas,
  datasBloqueadas,
  disponibilidades,
  empreendimentos,
  lembretesDeVisita,
  mensagens,
  negocios,
  type TipoDeLembrete,
  visitas,
  whatsappConexoes,
} from "@/lib/db/schema";
import {
  formatoDataHoraBrasilia,
  instanteEmBrasilia,
  partesEmBrasilia,
  somarDias,
} from "@/lib/fuso";
import * as whatsapp from "@/lib/whatsapp";
import { mudarEtapa } from "./negocios";
import { requireCorretor, type Session } from "./session";

// Visitas (GLOSSARY → Visita, histórias 54–60, 62). A disponibilidade do
// corretor vem de src/data/disponibilidade.ts; aqui ficam os encaixes, o
// agendamento e os lembretes do worker. Horários em Brasília.

// Toda visita dura uma hora; encaixes começam de meia em meia hora.
export const DURACAO_DA_VISITA_MIN = 60;
const PASSO_MIN = 30;
const ATIVAS = ["agendada", "remarcada"] as const;
// Lembretes só saem a partir das 8h (spec: 8h–20h).
const HORA_DE_INICIO_DOS_LEMBRETES = 8;

export class HorarioIndisponivelError extends Error {
  override name = "HorarioIndisponivelError";
}

const columns = {
  id: visitas.id,
  negocioId: visitas.negocioId,
  dataHora: visitas.dataHora,
  local: visitas.local,
  latitude: visitas.latitude,
  longitude: visitas.longitude,
  estado: visitas.estado,
  eventoCalendarId: visitas.eventoCalendarId,
};

export type Visita = {
  id: string;
  negocioId: string;
  dataHora: Date;
  local: string;
  latitude: number | null;
  longitude: number | null;
  estado: (typeof visitas.$inferSelect)["estado"];
  eventoCalendarId: string | null;
};

const minutos = (horario: string) => {
  const [h, m] = horario.split(":").map(Number) as [number, number];
  return h * 60 + m;
};
const fim = (inicio: Date) =>
  new Date(inicio.getTime() + DURACAO_DA_VISITA_MIN * 60_000);
const sobrepoe = (a: Date, b: Date) => a < fim(b) && b < fim(a);

// Encaixes livres do corretor da sessão, do instante `aPartirDe` por `dias`
// dias civis: janelas da semana, menos datas bloqueadas, menos visitas
// ativas, só no futuro.
export async function horariosLivres(
  session: Session,
  input: { aPartirDe: Date; dias: number },
): Promise<Date[]> {
  const { corretorId } = requireCorretor(session);
  const partesDeInicio = partesEmBrasilia(input.aPartirDe);
  const diasAteDomingo = 7 - partesDeInicio.diaDaSemana;
  const dias = Math.max(0, Math.min(diasAteDomingo, 7, Math.trunc(input.dias)));
  const inicio = partesDeInicio.data;
  const limite = instanteEmBrasilia(somarDias(inicio, dias), "00:00");

  const [janelas, bloqueios, ocupadas] = await Promise.all([
    db
      .select({
        diaDaSemana: disponibilidades.diaDaSemana,
        inicio: disponibilidades.inicio,
        fim: disponibilidades.fim,
      })
      .from(disponibilidades)
      .where(eq(disponibilidades.corretorId, corretorId)),
    db
      .select({ data: datasBloqueadas.data })
      .from(datasBloqueadas)
      .where(eq(datasBloqueadas.corretorId, corretorId)),
    visitasAtivasEntre(corretorId, input.aPartirDe, limite),
  ]);
  if (janelas.length === 0) return [];
  const bloqueadas = new Set(bloqueios.map((b) => b.data));

  const livres: Date[] = [];
  for (let i = 0; i < dias; i++) {
    const data = somarDias(inicio, i);
    if (bloqueadas.has(data)) continue;
    const diaDaSemana = partesEmBrasilia(
      instanteEmBrasilia(data, "12:00"),
    ).diaDaSemana;
    for (const janela of janelas) {
      if (janela.diaDaSemana !== diaDaSemana) continue;
      for (
        let m = minutos(janela.inicio);
        m + DURACAO_DA_VISITA_MIN <= minutos(janela.fim);
        m += PASSO_MIN
      ) {
        const horario = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
        const encaixe = instanteEmBrasilia(data, horario);
        if (encaixe <= input.aPartirDe) continue;
        if (ocupadas.some((v) => sobrepoe(encaixe, v.dataHora))) continue;
        livres.push(encaixe);
      }
    }
  }
  return livres.sort((a, b) => a.getTime() - b.getTime());
}

function visitasAtivasEntre(corretorId: string, de: Date, ate: Date) {
  return db
    .select({ id: visitas.id, dataHora: visitas.dataHora })
    .from(visitas)
    .where(
      and(
        eq(visitas.corretorId, corretorId),
        inArray(visitas.estado, [...ATIVAS]),
        gte(
          visitas.dataHora,
          new Date(de.getTime() - DURACAO_DA_VISITA_MIN * 60_000),
        ),
        lt(visitas.dataHora, ate),
      ),
    );
}

// O horário cabe numa janela, não está bloqueado, está na grade de 30 min,
// é futuro e não conflita com outra visita ativa (fora a própria, ao
// remarcar). Lança HorarioIndisponivelError.
async function exigirHorarioLivre(
  corretorId: string,
  dataHora: Date,
  ignorarVisitaId?: string,
) {
  if (Number.isNaN(dataHora.getTime()) || dataHora <= new Date()) {
    throw new HorarioIndisponivelError("Horário no passado");
  }
  const p = partesEmBrasilia(dataHora);
  if (p.minuto % PASSO_MIN !== 0 || dataHora.getSeconds() !== 0) {
    throw new HorarioIndisponivelError("Horário fora da grade de 30 minutos");
  }
  const inicioMin = p.hora * 60 + p.minuto;
  const [janelas, [bloqueio], ocupadas] = await Promise.all([
    db
      .select({ inicio: disponibilidades.inicio, fim: disponibilidades.fim })
      .from(disponibilidades)
      .where(
        and(
          eq(disponibilidades.corretorId, corretorId),
          eq(disponibilidades.diaDaSemana, p.diaDaSemana),
        ),
      ),
    db
      .select({ id: datasBloqueadas.id })
      .from(datasBloqueadas)
      .where(
        and(
          eq(datasBloqueadas.corretorId, corretorId),
          eq(datasBloqueadas.data, p.data),
        ),
      ),
    visitasAtivasEntre(corretorId, dataHora, fim(dataHora)),
  ]);
  const cabe = janelas.some(
    (j) =>
      minutos(j.inicio) <= inicioMin &&
      inicioMin + DURACAO_DA_VISITA_MIN <= minutos(j.fim),
  );
  if (!cabe) throw new HorarioIndisponivelError("Fora da disponibilidade");
  if (bloqueio) throw new HorarioIndisponivelError("Data bloqueada");
  if (
    ocupadas.some(
      (v) => v.id !== ignorarVisitaId && sobrepoe(dataHora, v.dataHora),
    )
  ) {
    throw new HorarioIndisponivelError("Já há uma visita nesse horário");
  }
}

// A unique parcial (corretor, data_hora, ativa) é a última linha de defesa
// para duas chamadas simultâneas.
function conflitoDeHorario(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

export type OpcoesDeAgendamento = {
  autor?: AutorDeEtapa;
  // Envia ao cliente a confirmação (texto + localização) pelo WhatsApp do
  // corretor e grava na conversa. O assistente usa; a interface do corretor
  // não.
  notificarCliente?: boolean;
};

// História 55: a visita é marcada direto, no endereço do empreendimento de
// interesse (ou do lote), e o negócio vai para Visita agendada. Idempotente
// pelo `id`. Negócio fora do escopo → null.
export async function agendarVisita(
  session: Session,
  input: {
    id?: string;
    negocioId: string;
    dataHora: Date;
  } & OpcoesDeAgendamento,
): Promise<Visita | null> {
  const { corretorId, imobiliariaId } = requireCorretor(session);
  if (!z.uuid().safeParse(input.negocioId).success) return null;
  if (input.id) {
    const existente = await buscarVisita(session, input.id);
    if (existente) return existente;
  }

  const [negocio] = await db
    .select({
      id: negocios.id,
      empreendimentoInteresseId: negocios.empreendimentoInteresseId,
    })
    .from(negocios)
    .where(
      and(
        eq(negocios.id, input.negocioId),
        eq(negocios.corretorId, corretorId),
      ),
    );
  if (!negocio) return null;
  const local = await localPadrao(negocio);
  if (!local) {
    throw new HorarioIndisponivelError(
      "O negócio ainda não tem empreendimento de interesse",
    );
  }

  await exigirHorarioLivre(corretorId, input.dataHora);
  const agora = new Date();
  let criada: Visita | undefined;
  try {
    [criada] = await db
      .insert(visitas)
      .values({
        id: input.id,
        imobiliariaId,
        corretorId,
        negocioId: negocio.id,
        dataHora: input.dataHora,
        ...local,
        estado: "agendada",
        criadaEm: agora,
        atualizadaEm: agora,
      })
      .onConflictDoNothing({ target: visitas.id })
      .returning(columns);
  } catch (error) {
    if (conflitoDeHorario(error)) {
      throw new HorarioIndisponivelError("Já há uma visita nesse horário");
    }
    throw error;
  }
  if (!criada) return input.id ? buscarVisita(session, input.id) : null;

  await mudarEtapa(session, negocio.id, "visita_agendada", {
    autor: input.autor ?? "corretor",
  });
  if (input.notificarCliente) {
    await notificarCliente(session, criada, "agendada");
  }
  return criada;
}

async function localPadrao(negocio: {
  empreendimentoInteresseId: string | null;
}) {
  if (!negocio.empreendimentoInteresseId) return null;
  const [e] = await db
    .select({
      local: empreendimentos.endereco,
      latitude: empreendimentos.latitude,
      longitude: empreendimentos.longitude,
    })
    .from(empreendimentos)
    .where(eq(empreendimentos.id, negocio.empreendimentoInteresseId));
  return e ?? null;
}

export async function buscarVisita(
  session: Session,
  id: string,
): Promise<Visita | null> {
  const { corretorId } = requireCorretor(session);
  if (!z.uuid().safeParse(id).success) return null;
  const [found] = await db
    .select(columns)
    .from(visitas)
    .where(and(eq(visitas.id, id), eq(visitas.corretorId, corretorId)));
  return found ?? null;
}

// A visita ativa (agendada ou remarcada) do negócio, se houver.
export async function buscarVisitaAtiva(
  session: Session,
  negocioId: string,
): Promise<Visita | null> {
  const { corretorId } = requireCorretor(session);
  if (!z.uuid().safeParse(negocioId).success) return null;
  const [found] = await db
    .select(columns)
    .from(visitas)
    .where(
      and(
        eq(visitas.negocioId, negocioId),
        eq(visitas.corretorId, corretorId),
        inArray(visitas.estado, [...ATIVAS]),
      ),
    )
    .orderBy(asc(visitas.dataHora))
    .limit(1);
  return found ?? null;
}

// Próximas visitas ativas do corretor, com o cliente, para a agenda.
export async function listarVisitas(session: Session) {
  const { corretorId } = requireCorretor(session);
  return db
    .select({ ...columns, clienteNome: clientes.nome })
    .from(visitas)
    .innerJoin(negocios, eq(negocios.id, visitas.negocioId))
    .innerJoin(clientes, eq(clientes.id, negocios.clienteId))
    .where(
      and(
        eq(visitas.corretorId, corretorId),
        inArray(visitas.estado, [...ATIVAS]),
        gte(
          visitas.dataHora,
          new Date(Date.now() - DURACAO_DA_VISITA_MIN * 60_000),
        ),
      ),
    )
    .orderBy(asc(visitas.dataHora));
}

// História 60: novo horário livre; a visita fica Remarcada e o antigo libera.
export async function remarcarVisita(
  session: Session,
  visitaId: string,
  input: { dataHora: Date } & OpcoesDeAgendamento,
): Promise<Visita | null> {
  const { corretorId } = requireCorretor(session);
  const atual = await buscarVisita(session, visitaId);
  if (!atual || !ATIVAS.includes(atual.estado as (typeof ATIVAS)[number])) {
    return null;
  }
  if (atual.dataHora.getTime() === input.dataHora.getTime()) return atual;
  await exigirHorarioLivre(corretorId, input.dataHora, atual.id);
  let alterada: Visita | undefined;
  try {
    [alterada] = await db
      .update(visitas)
      .set({
        dataHora: input.dataHora,
        estado: "remarcada",
        atualizadaEm: new Date(),
      })
      .where(eq(visitas.id, atual.id))
      .returning(columns);
  } catch (error) {
    if (conflitoDeHorario(error)) {
      throw new HorarioIndisponivelError("Já há uma visita nesse horário");
    }
    throw error;
  }
  if (!alterada) return null;
  if (input.notificarCliente) {
    await notificarCliente(session, alterada, "remarcada");
  }
  return alterada;
}

// "Levar a Cancelada": repetir não altera.
export async function cancelarVisita(
  session: Session,
  visitaId: string,
): Promise<Visita | null> {
  const atual = await buscarVisita(session, visitaId);
  if (!atual) return null;
  if (atual.estado === "cancelada") return atual;
  const [alterada] = await db
    .update(visitas)
    .set({ estado: "cancelada", atualizadaEm: new Date() })
    .where(eq(visitas.id, atual.id))
    .returning(columns);
  return alterada ?? null;
}

// História 57: o corretor muda o local (ex.: a imobiliária). Sem
// coordenadas novas, as antigas são descartadas (não apontam mais para lá).
export async function alterarLocalDaVisita(
  session: Session,
  visitaId: string,
  input: { local: string; latitude?: number | null; longitude?: number | null },
): Promise<Visita | null> {
  const atual = await buscarVisita(session, visitaId);
  if (!atual) return null;
  const local = input.local.trim();
  if (!local) return atual;
  const [alterada] = await db
    .update(visitas)
    .set({
      local,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      atualizadaEm: new Date(),
    })
    .where(eq(visitas.id, atual.id))
    .returning(columns);
  return alterada ?? null;
}

// --- WhatsApp ---------------------------------------------------------------

type Destinatario = {
  instancia: string;
  telefone: string;
  conversaId: string | null;
  clienteNome: string;
};

// O cliente do negócio e a instância do corretor; null se o WhatsApp do
// corretor não está pareado (nada a enviar).
async function destinatarioDaVisita(visita: {
  negocioId: string;
}): Promise<Destinatario | null> {
  const [row] = await db
    .select({
      instancia: whatsappConexoes.instancia,
      telefone: clientes.telefone,
      clienteNome: clientes.nome,
      conversaId: conversas.id,
    })
    .from(negocios)
    .innerJoin(clientes, eq(clientes.id, negocios.clienteId))
    .innerJoin(
      whatsappConexoes,
      eq(whatsappConexoes.corretorId, negocios.corretorId),
    )
    .leftJoin(
      conversas,
      and(
        eq(conversas.clienteId, negocios.clienteId),
        eq(conversas.corretorId, negocios.corretorId),
      ),
    )
    .where(eq(negocios.id, visita.negocioId));
  if (!row?.instancia) return null;
  return { ...row, instancia: row.instancia };
}

async function enviarAoCliente(
  destino: Destinatario,
  texto: string,
  localizacao?: Visita,
) {
  const envio = await whatsapp.enviarTexto(
    destino.instancia,
    destino.telefone,
    texto,
  );
  await gravarMensagem(destino, envio.idMensagem, texto);
  if (localizacao?.latitude != null && localizacao.longitude != null) {
    const loc = await whatsapp.enviarLocalizacao(
      destino.instancia,
      destino.telefone,
      {
        latitude: localizacao.latitude,
        longitude: localizacao.longitude,
        nome: "Local da visita",
        endereco: localizacao.local,
      },
    );
    await gravarMensagem(
      destino,
      loc.idMensagem,
      `[localização] ${localizacao.local}`,
    );
  }
}

// Fica na conversa como mensagem do assistente (unique conversa + id torna
// o eco do webhook um no-op). Cliente sem conversa (cadastro manual): só
// envia.
async function gravarMensagem(
  destino: Destinatario,
  idMensagem: string,
  texto: string,
) {
  if (!destino.conversaId) return;
  const agora = new Date();
  await db
    .insert(mensagens)
    .values({
      conversaId: destino.conversaId,
      evolutionId: idMensagem,
      autor: "assistente",
      texto,
      fromMe: true,
      enviadaEm: agora,
      criadaEm: agora,
    })
    .onConflictDoNothing({
      target: [mensagens.conversaId, mensagens.evolutionId],
    });
}

const quando = (d: Date) => formatoDataHoraBrasilia.format(d);

async function notificarCliente(
  _session: Session,
  visita: Visita,
  motivo: "agendada" | "remarcada",
) {
  const destino = await destinatarioDaVisita(visita);
  if (!destino) return;
  const texto =
    motivo === "agendada"
      ? `Visita confirmada para ${quando(visita.dataHora)}. Local: ${visita.local}. Se precisar remarcar, é só me avisar.`
      : `Sua visita foi remarcada para ${quando(visita.dataHora)}. Local: ${visita.local}.`;
  await enviarAoCliente(destino, texto, visita);
}

// --- Lembretes (worker) -------------------------------------------------------

// Histórias 58 e 59: véspera (a partir das 8h do dia anterior) e manhã (das
// 8h até a hora da visita). Cada lembrete tem chave única (visita, tipo):
// rodar o worker de novo não reenvia. Falha no envio desfaz a marcação.
export async function enviarLembretesDeVisita(): Promise<{ enviados: number }> {
  const agora = new Date();
  const hoje = partesEmBrasilia(agora);
  if (hoje.hora < HORA_DE_INICIO_DOS_LEMBRETES) return { enviados: 0 };
  const amanha = somarDias(hoje.data, 1);

  const candidatas = await db
    .select({ ...columns, corretorId: visitas.corretorId })
    .from(visitas)
    .where(
      and(
        inArray(visitas.estado, [...ATIVAS]),
        gte(visitas.dataHora, agora),
        lt(
          visitas.dataHora,
          instanteEmBrasilia(somarDias(hoje.data, 2), "00:00"),
        ),
      ),
    );

  let enviados = 0;
  for (const visita of candidatas) {
    const dia = partesEmBrasilia(visita.dataHora).data;
    const tipos: Array<{ tipo: TipoDeLembrete; para: "cliente" | "corretor" }> =
      dia === amanha
        ? [
            { tipo: "cliente_vespera", para: "cliente" },
            { tipo: "corretor_vespera", para: "corretor" },
          ]
        : dia === hoje.data
          ? [
              { tipo: "cliente_manha", para: "cliente" },
              { tipo: "corretor_manha", para: "corretor" },
            ]
          : [];
    for (const { tipo, para } of tipos) {
      if (await enviarLembrete(visita, tipo, para)) enviados++;
    }
  }
  return { enviados };
}

async function enviarLembrete(
  visita: Visita & { corretorId: string },
  tipo: TipoDeLembrete,
  para: "cliente" | "corretor",
) {
  return db.transaction(async (tx) => {
    const [marcado] = await tx
      .insert(lembretesDeVisita)
      .values({ visitaId: visita.id, tipo, enviadoEm: new Date() })
      .onConflictDoNothing()
      .returning({ id: lembretesDeVisita.id });
    if (!marcado) return false;

    const destino = await destinatarioDaVisita(visita);
    if (!destino) return false;
    const dia = tipo.endsWith("vespera") ? "amanhã" : "hoje";
    if (para === "cliente") {
      await enviarAoCliente(
        destino,
        `Lembrete: sua visita é ${dia}, ${quando(visita.dataHora)}. Local: ${visita.local}. Até lá!`,
      );
      return true;
    }
    // TODO(ticket 11): enviar ao corretor pelo número de sistema
    // (`enviarTextoDoSistema` em src/lib/whatsapp.ts). Pelo número do
    // próprio corretor não dá: ele mandaria mensagem para si mesmo.
    console.log(
      `[lembretes] TODO ticket 11: lembrete ${tipo} ao corretor ${visita.corretorId} ` +
        `(visita ${visita.id} com ${destino.clienteNome}, ${quando(visita.dataHora)})`,
    );
    return false;
  });
}

// Para src/worker/jobs.ts: evita importar o módulo inteiro lá.
export const jobDeLembretesDeVisita = {
  nome: "lembretes-de-visita",
  executar: enviarLembretesDeVisita,
};
