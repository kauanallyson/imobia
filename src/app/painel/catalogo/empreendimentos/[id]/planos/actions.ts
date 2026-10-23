"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  criarPlanoDePagamento,
  editarPlanoDePagamento,
  removerPlanoDePagamento,
} from "@/data/planos-de-pagamento";
import { verificarCorretor } from "@/data/session";
import type { FormState } from "../../../actions";

const planoSchema = z.object({
  id: z.uuid(),
  empreendimentoId: z.uuid(),
  nome: z.string().trim().min(1),
  percentualDeEntrada: z.coerce.number().min(0).max(100),
  numeroDeParcelas: z.coerce.number().int().min(1),
  condicoes: z.string().trim().default(""),
});
const erroPlano =
  "Preencha nome, percentual de entrada (0 a 100) e número de parcelas (1 ou mais).";

const paginaDePlanos = "/painel/catalogo/empreendimentos/[id]/planos";

export async function criarPlanoAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await verificarCorretor();
  const input = planoSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return { erro: erroPlano };

  if (!(await criarPlanoDePagamento(session, input.data))) {
    return { erro: "Empreendimento não encontrado." };
  }
  revalidatePath(paginaDePlanos, "page");
  return { ok: true };
}

export async function editarPlanoAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await verificarCorretor();
  const input = planoSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return { erro: erroPlano };

  const { id, empreendimentoId: _e, ...dados } = input.data;
  if (!(await editarPlanoDePagamento(session, id, dados))) {
    return { erro: "Plano não encontrado." };
  }
  revalidatePath("/painel/catalogo", "layout");
  return { ok: true };
}

const removerSchema = z.object({
  planoId: z.uuid(),
  empreendimentoId: z.uuid(),
});

// Botão simples: remover de novo não falha.
export async function removerPlanoAction(formData: FormData) {
  const session = await verificarCorretor();
  const input = removerSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return;

  await removerPlanoDePagamento(session, input.data.planoId);
  revalidatePath(paginaDePlanos, "page");
  redirect(
    `/painel/catalogo/empreendimentos/${input.data.empreendimentoId}/planos`,
  );
}
