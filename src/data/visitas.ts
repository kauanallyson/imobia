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
  negocios,
  type TipoDeLembrete,
  users,
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
import {
  type Canal,
  enviarLocalizacaoAoCliente,
  enviarTextoAoCliente,
  OptOutError,
} from "./assistente/contexto";
import { naJanelaDeEnvio } from "./cadencia";
import { ocupadosNoGoogle, refletirVisitaNoGoogle } from "./google-calendar";
import { mudarEtapa } from "./negocios";
import { requireCorretor, type Session } from "./session";

// Visitas (GLOSSARY → Visita, histórias 54–60, 62). A disponibilidade do
// corretor vem de src/data/disponibilidade.ts; aqui ficam os encaixes, o
// agendamento e os lembretes do worker. Horários em Brasília.

// Toda visita dura uma hora; encaixes começam de meia em meia hora.
export const DURACAO_DA_VISITA_MIN = 60;
const PASSO_MIN = 30;
const ATIVAS = ["agendada", "remarcada"] as const;

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
// ativas, menos compromissos do Google Calendar (se conectado), só no futuro.
export async function horariosLivres(
  session: Session,
  input: { aPartirDe: Date; dias: number },
): Promise<Date[]> {
  const { corretorId } = requireCorretor(session);
  return encaixesLivres(corretorId, input);
}

// Ao remarcar, a própria visita (e o evento dela no Google) não ocupa.
type VisitaIgnorada = { id: string; dataHora: Date };

async function encaixesLivres(
  corretorId: string,
  input: { aPartirDe: Date; dias: number },
  ignorar?: VisitaIgnorada,
): Promise<Date[]> {
  const partesDeInicio = partesEmBrasilia(input.aPartirDe);
  const diasAteDomingo =
    partesDeInicio.diaDaSemana === 0 ? 1 : 8 - partesDeInicio.diaDaSemana;
  const dias = Math.max(0, Math.min(diasAteDomingo, 7, Math.trunc(input.dias)));
  const inicio = partesDeInicio.data;
  const limite = instanteEmBrasilia(somarDias(inicio, dias), "00:00");

  const [janelas, bloqueios, ativas, google] = await Promise.all([
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
    ocupadosNoGoogle(corretorId, input.aPartirDe, limite),
  ]);
  if (janelas.length === 0) return [];
  const bloqueadas = new Set(bloqueios.map((b) => b.data));
  const ocupadas = ativas.filter((v) => v.id !== ignorar?.id);
  const noGoogle = ignorar
    ? google.filter(
        (b) =>
          b.inicio.getTime() !== ignorar.dataHora.getTime() ||
          b.fim.getTime() !== fim(ignorar.dataHora).getTime(),
      )
    : google;

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
        if (noGoogle.some((b) => encaixe < b.fim && b.inicio < fim(encaixe))) {
          continue;
        }
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

// História 53: só se marca um horário que `horariosLivres` ofereceria agora
// (janelas, bloqueios, outras visitas, Google se conectado, semana corrente),
// fora a própria visita ao remarcar. Lança HorarioIndisponivelError.
async function exigirHorarioLivre(
  corretorId: string,
  dataHora: Date,
  ignorar?: VisitaIgnorada,
) {
  const agora = new Date();
  if (Number.isNaN(dataHora.getTime()) || dataHora <= agora) {
    throw new HorarioIndisponivelError("Horário no passado");
  }
  const livres = await encaixesLivres(
    corretorId,
    { aPartirDe: agora, dias: 7 },
    ignorar,
  );
  if (!livres.some((l) => l.getTime() === dataHora.getTime())) {
    throw new HorarioIndisponivelError(
      "Horário indisponível (fora da disponibilidade desta semana, bloqueado ou ocupado)",
    );
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
  criada.eventoCalendarId = await refletirVisitaNoGoogle(criada.id);

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
  await exigirHorarioLivre(corretorId, input.dataHora, atual);
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
  alterada.eventoCalendarId = await refletirVisitaNoGoogle(alterada.id);
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
  if (alterada) await refletirVisitaNoGoogle(alterada.id);
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
  if (alterada) await refletirVisitaNoGoogle(alterada.id);
  return alterada ?? null;
}

// --- WhatsApp ---------------------------------------------------------------

type Destinatario = {
  instancia: string | null;
  telefone: string;
  telefoneDoCorretor: string | null;
  conversaId: string | null;
  // Conversa desligada (pelo corretor ou na exclusão LGPD) ou cliente
  // anonimizado: os lembretes automáticos não saem.
  semLembretes: boolean;
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
      telefoneDoCorretor: users.telefone,
      clienteNome: clientes.nome,
      anonimizadoEm: clientes.anonimizadoEm,
      conversaId: conversas.id,
      assistente: conversas.assistente,
    })
    .from(negocios)
    .innerJoin(clientes, eq(clientes.id, negocios.clienteId))
    .leftJoin(
      whatsappConexoes,
      eq(whatsappConexoes.corretorId, negocios.corretorId),
    )
    .innerJoin(users, eq(users.id, negocios.corretorId))
    .leftJoin(
      conversas,
      and(
        eq(conversas.clienteId, negocios.clienteId),
        eq(conversas.corretorId, negocios.corretorId),
      ),
    )
    .where(eq(negocios.id, visita.negocioId));
  if (!row) return null;
  const { anonimizadoEm, assistente, ...destino } = row;
  return {
    ...destino,
    semLembretes: anonimizadoEm !== null || assistente === "desligado",
  };
}

// Pelo caminho único de envio ao cliente (assistente/contexto.ts): respeita
// o opt-out (nada sai) e grava na conversa. Com coordenadas, manda também a
// localização.
async function enviarAoCliente(
  destino: Destinatario,
  texto: string,
  localizacao?: Visita,
): Promise<boolean> {
  if (!destino.instancia) return false;
  const canal: Canal = {
    instancia: destino.instancia,
    conversa: { id: destino.conversaId, telefone: destino.telefone },
  };
  try {
    await enviarTextoAoCliente(canal, texto);
    if (localizacao?.latitude != null && localizacao.longitude != null) {
      await enviarLocalizacaoAoCliente(canal, {
        latitude: localizacao.latitude,
        longitude: localizacao.longitude,
        nome: "Local da visita",
        endereco: localizacao.local,
      });
    }
    return true;
  } catch (error) {
    if (error instanceof OptOutError) return false;
    throw error;
  }
}

const quando = (d: Date) => formatoDataHoraBrasilia.format(d);

async function notificarCliente(
  _session: Session,
  visita: Visita,
  motivo: "agendada" | "remarcada",
) {
  const destino = await destinatarioDaVisita(visita);
  if (!destino?.instancia) return;
  const texto =
    motivo === "agendada"
      ? `Visita confirmada para ${quando(visita.dataHora)}. Local: ${visita.local}. Se precisar remarcar, é só me avisar.`
      : `Sua visita foi remarcada para ${quando(visita.dataHora)}. Local: ${visita.local}.`;
  await enviarAoCliente(destino, texto, visita);
}

// --- Lembretes (worker) -------------------------------------------------------

// Histórias 58 e 59: véspera (no dia anterior) e manhã (no dia, até a hora
// da visita), só na janela 8h–20h de segunda a sábado (spec → Horário);
// fora dela, esperam a próxima janela. Cada lembrete tem chave única (visita, tipo):
// rodar o worker de novo não reenvia. Falha no envio desfaz a marcação.
export async function enviarLembretesDeVisita(): Promise<{ enviados: number }> {
  const agora = new Date();
  const hoje = partesEmBrasilia(agora);
  if (!naJanelaDeEnvio(agora)) return { enviados: 0 };
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
  const destino = await destinatarioDaVisita(visita);
  if (!destino) return false;
  const telefoneDoCorretor = destino.telefoneDoCorretor;
  if (para === "corretor" && !telefoneDoCorretor) return false;
  if (para === "cliente" && (destino.semLembretes || !destino.instancia)) {
    return false;
  }
  return db.transaction(async (tx) => {
    const [marcado] = await tx
      .insert(lembretesDeVisita)
      .values({ visitaId: visita.id, tipo, enviadoEm: new Date() })
      .onConflictDoNothing()
      .returning({ id: lembretesDeVisita.id });
    if (!marcado) return false;

    const dia = tipo.endsWith("vespera") ? "amanhã" : "hoje";
    if (para === "cliente") {
      // Opt-out: a marcação fica (não tenta de novo), nada sai.
      return enviarAoCliente(
        destino,
        `Lembrete: sua visita é ${dia}, ${quando(visita.dataHora)}. Local: ${visita.local}. Até lá!`,
      );
    }
    if (!telefoneDoCorretor) return false;
    await whatsapp.enviarTextoDoSistema(
      telefoneDoCorretor,
      `Lembrete: visita com ${destino.clienteNome} ${dia}, ${quando(visita.dataHora)}. Local: ${visita.local}.`,
    );
    return true;
  });
}

// Para src/worker/jobs.ts: evita importar o módulo inteiro lá.
export const jobDeLembretesDeVisita = {
  nome: "lembretes-de-visita",
  executar: enviarLembretesDeVisita,
};
