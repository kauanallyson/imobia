"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { criarCliente, TelefoneDuplicadoError } from "@/data/clientes";
import {
  criarNegocio,
  MotivoObrigatorioError,
  marcarPerdido,
  mudarEtapa,
  reabrir,
} from "@/data/negocios";
import { verificarCorretor } from "@/data/session";
import { etapas } from "@/lib/db/schema";

export type FormState = { erro?: string; ok?: boolean };

const detalhe = (id: string) => `/painel/negocios/${id}`;

function revalidarNegocio(id: string) {
  revalidatePath("/painel");
  revalidatePath(detalhe(id));
}

const mudarEtapaSchema = z.object({
  negocioId: z.uuid(),
  etapa: z.enum(etapas.filter((e) => e !== "perdido")),
});

export async function mudarEtapaAction(formData: FormData) {
  const session = await verificarCorretor();
  const input = mudarEtapaSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return;
  await mudarEtapa(session, input.data.negocioId, input.data.etapa);
  revalidarNegocio(input.data.negocioId);
}

const perdidoSchema = z.object({
  negocioId: z.uuid(),
  motivo: z.string().trim().min(1),
});

export async function marcarPerdidoAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await verificarCorretor();
  const input = perdidoSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return { erro: "Informe o motivo da perda." };
  try {
    const negocio = await marcarPerdido(
      session,
      input.data.negocioId,
      input.data.motivo,
    );
    if (!negocio) return { erro: "Negócio não encontrado." };
  } catch (error) {
    if (error instanceof MotivoObrigatorioError) {
      return { erro: "Informe o motivo da perda." };
    }
    throw error;
  }
  revalidarNegocio(input.data.negocioId);
  return { ok: true };
}

export async function reabrirAction(formData: FormData) {
  const session = await verificarCorretor();
  const id = z.uuid().safeParse(formData.get("negocioId"));
  if (!id.success) return;
  await reabrir(session, id.data);
  revalidarNegocio(id.data);
}

const novoClienteSchema = z.object({
  clienteId: z.uuid(),
  negocioId: z.uuid(),
  nome: z.string().trim().min(1),
  telefone: z.string().trim().min(8),
  email: z.email().or(z.literal("")).optional(),
});

// Cadastro manual: cliente novo + primeiro negócio em Novo, de uma vez.
export async function criarClienteENegocioAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await verificarCorretor();
  const input = novoClienteSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return { erro: "Preencha nome e telefone válidos." };
  const { clienteId, negocioId, nome, telefone, email } = input.data;

  try {
    await criarCliente(session, { id: clienteId, nome, telefone, email });
  } catch (error) {
    if (error instanceof TelefoneDuplicadoError) {
      return { erro: "Você já tem um cliente com esse telefone." };
    }
    throw error;
  }
  const negocio = await criarNegocio(session, { id: negocioId, clienteId });
  if (!negocio) return { erro: "Cliente não encontrado." };
  revalidatePath("/painel");
  redirect(detalhe(negocio.id));
}

const novoNegocioSchema = z.object({
  clienteId: z.uuid(),
  negocioId: z.uuid(),
});

// Segundo (terceiro...) negócio de um cliente que já existe.
export async function criarNegocioAction(formData: FormData) {
  const session = await verificarCorretor();
  const input = novoNegocioSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return;
  const negocio = await criarNegocio(session, {
    id: input.data.negocioId,
    clienteId: input.data.clienteId,
  });
  if (!negocio) return;
  revalidatePath("/painel");
  redirect(detalhe(negocio.id));
}
