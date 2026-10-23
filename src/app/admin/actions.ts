"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { criarCorretor, desativarCorretor } from "@/data/corretores";
import { criarImobiliaria } from "@/data/imobiliarias";
import { verificarAdministrador } from "@/data/session";
import { DuplicateEmailError } from "@/data/users";

export type FormState = { erro?: string; ok?: boolean };

const imobiliariaSchema = z.object({
  id: z.uuid(),
  nome: z.string().trim().min(1),
});

export async function criarImobiliariaAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await verificarAdministrador();
  const input = imobiliariaSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return { erro: "Informe o nome da imobiliária." };

  await criarImobiliaria(session, input.data);
  revalidatePath("/admin");
  return { ok: true };
}

const corretorSchema = z.object({
  id: z.uuid(),
  imobiliariaId: z.uuid(),
  nome: z.string().trim().min(1),
  email: z.email(),
  senha: z.string().min(8),
});

export async function criarCorretorAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await verificarAdministrador();
  const input = corretorSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) {
    return { erro: "Preencha nome, e-mail e uma senha de 8+ caracteres." };
  }

  try {
    const corretor = await criarCorretor(session, input.data);
    if (!corretor) return { erro: "Imobiliária não encontrada." };
  } catch (error) {
    if (error instanceof DuplicateEmailError) {
      return { erro: "Já existe uma conta com esse e-mail." };
    }
    throw error;
  }
  revalidatePath(`/admin/imobiliarias/${input.data.imobiliariaId}`);
  return { ok: true };
}

export async function desativarCorretorAction(formData: FormData) {
  const session = await verificarAdministrador();
  const id = z.uuid().safeParse(formData.get("corretorId"));
  if (!id.success) return;

  await desativarCorretor(session, id.data);
  revalidatePath("/admin/imobiliarias/[id]", "page");
}
