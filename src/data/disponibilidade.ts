import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { datasBloqueadas, disponibilidades } from "@/lib/db/schema";
import { requireCorretor, type Session } from "./session";

// Disponibilidade do corretor (história 52): janelas semanais ("HH:MM" em
// horário de Brasília) e datas bloqueadas. Tudo é do corretor: o colega da
// mesma imobiliária não vê nem altera.

export class HorarioInvalidoError extends Error {
  override name = "HorarioInvalidoError";
}

export const horarioSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário no formato HH:MM");

const janelaColumns = {
  id: disponibilidades.id,
  diaDaSemana: disponibilidades.diaDaSemana,
  inicio: disponibilidades.inicio,
  fim: disponibilidades.fim,
};

const dataColumns = { id: datasBloqueadas.id, data: datasBloqueadas.data };

export type Janela = {
  id: string;
  diaDaSemana: number;
  inicio: string;
  fim: string;
};

export async function criarJanela(
  session: Session,
  input: { id?: string; diaDaSemana: number; inicio: string; fim: string },
): Promise<Janela> {
  const { corretorId, imobiliariaId } = requireCorretor(session);
  const valido = z
    .object({
      diaDaSemana: z.number().int().min(0).max(6),
      inicio: horarioSchema,
      fim: horarioSchema,
    })
    .refine((j) => j.inicio < j.fim, "O fim deve ser depois do início")
    .safeParse(input);
  if (!valido.success) {
    throw new HorarioInvalidoError(z.prettifyError(valido.error));
  }
  const [created] = await db
    .insert(disponibilidades)
    .values({ ...valido.data, id: input.id, corretorId, imobiliariaId })
    .onConflictDoNothing()
    .returning(janelaColumns);
  if (created) return created;
  const [found] = await db
    .select(janelaColumns)
    .from(disponibilidades)
    .where(
      and(
        eq(disponibilidades.corretorId, corretorId),
        input.id
          ? eq(disponibilidades.id, input.id)
          : and(
              eq(disponibilidades.diaDaSemana, valido.data.diaDaSemana),
              eq(disponibilidades.inicio, valido.data.inicio),
            ),
      ),
    );
  if (!found) throw new Error("janela não inserida");
  return found;
}

export async function listarJanelas(session: Session): Promise<Janela[]> {
  const { corretorId } = requireCorretor(session);
  return db
    .select(janelaColumns)
    .from(disponibilidades)
    .where(eq(disponibilidades.corretorId, corretorId))
    .orderBy(asc(disponibilidades.diaDaSemana), asc(disponibilidades.inicio));
}

export async function removerJanela(session: Session, id: string) {
  const { corretorId } = requireCorretor(session);
  if (!z.uuid().safeParse(id).success) return null;
  const [removed] = await db
    .delete(disponibilidades)
    .where(
      and(
        eq(disponibilidades.id, id),
        eq(disponibilidades.corretorId, corretorId),
      ),
    )
    .returning(janelaColumns);
  return removed ?? null;
}

export async function bloquearData(
  session: Session,
  input: { id?: string; data: string },
) {
  const { corretorId, imobiliariaId } = requireCorretor(session);
  const data = z.iso.date().safeParse(input.data);
  if (!data.success) throw new HorarioInvalidoError("Data inválida");
  const [created] = await db
    .insert(datasBloqueadas)
    .values({ id: input.id, data: data.data, corretorId, imobiliariaId })
    .onConflictDoNothing()
    .returning(dataColumns);
  if (created) return created;
  const [found] = await db
    .select(dataColumns)
    .from(datasBloqueadas)
    .where(
      and(
        eq(datasBloqueadas.corretorId, corretorId),
        eq(datasBloqueadas.data, data.data),
      ),
    );
  if (!found) throw new Error("data não bloqueada");
  return found;
}

export async function listarDatasBloqueadas(session: Session) {
  const { corretorId } = requireCorretor(session);
  return db
    .select(dataColumns)
    .from(datasBloqueadas)
    .where(eq(datasBloqueadas.corretorId, corretorId))
    .orderBy(asc(datasBloqueadas.data));
}

export async function desbloquearData(session: Session, id: string) {
  const { corretorId } = requireCorretor(session);
  if (!z.uuid().safeParse(id).success) return null;
  const [removed] = await db
    .delete(datasBloqueadas)
    .where(
      and(
        eq(datasBloqueadas.id, id),
        eq(datasBloqueadas.corretorId, corretorId),
      ),
    )
    .returning(dataColumns);
  return removed ?? null;
}
