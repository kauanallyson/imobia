"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  bloquearData,
  criarJanela,
  desbloquearData,
  HorarioInvalidoError,
  horarioSchema,
  removerJanela,
} from "@/data/disponibilidade";
import { verificarCorretor } from "@/data/session";
import { alterarLocalDaVisita, cancelarVisita } from "@/data/visitas";

export type FormState = { erro?: string; ok?: boolean };

const AGENDA = "/painel/agenda";

const janelaSchema = z.object({
  id: z.uuid(),
  diaDaSemana: z.coerce.number().int().min(0).max(6),
  inicio: horarioSchema,
  fim: horarioSchema,
});

export async function criarJanelaAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await verificarCorretor();
  const input = janelaSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return { erro: "Informe dia, início e fim (HH:MM)." };
  try {
    await criarJanela(session, input.data);
  } catch (error) {
    if (error instanceof HorarioInvalidoError) {
      return { erro: "O fim precisa ser depois do início." };
    }
    throw error;
  }
  revalidatePath(AGENDA);
  return { ok: true };
}

export async function removerJanelaAction(formData: FormData) {
  const session = await verificarCorretor();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  await removerJanela(session, id.data);
  revalidatePath(AGENDA);
}

const bloqueioSchema = z.object({ id: z.uuid(), data: z.iso.date() });

export async function bloquearDataAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await verificarCorretor();
  const input = bloqueioSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return { erro: "Escolha uma data." };
  await bloquearData(session, input.data);
  revalidatePath(AGENDA);
  return { ok: true };
}

export async function desbloquearDataAction(formData: FormData) {
  const session = await verificarCorretor();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  await desbloquearData(session, id.data);
  revalidatePath(AGENDA);
}

const localSchema = z.object({
  visitaId: z.uuid(),
  local: z.string().trim().min(1),
});

export async function alterarLocalDaVisitaAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await verificarCorretor();
  const input = localSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return { erro: "Informe o novo local." };
  const visita = await alterarLocalDaVisita(session, input.data.visitaId, {
    local: input.data.local,
  });
  if (!visita) return { erro: "Visita não encontrada." };
  revalidatePath(AGENDA);
  return { ok: true };
}

export async function cancelarVisitaAction(formData: FormData) {
  const session = await verificarCorretor();
  const id = z.uuid().safeParse(formData.get("visitaId"));
  if (!id.success) return;
  await cancelarVisita(session, id.data);
  revalidatePath(AGENDA);
  revalidatePath("/painel");
}
