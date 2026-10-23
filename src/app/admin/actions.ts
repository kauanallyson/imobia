"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  criarCorretor,
  definirTelefoneDoCorretor,
  desativarCorretor,
} from "@/data/corretores";
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
  // WhatsApp do corretor para os avisos de pendência; opcional.
  telefone: z
    .string()
    .trim()
    .transform((t) => t.replace(/\D/g, ""))
    .refine((t) => t === "" || /^\d{12,13}$/.test(t))
    .optional(),
});

const telefoneSchema = z.object({
  corretorId: z.uuid(),
  telefone: z
    .string()
    .trim()
    .transform((t) => t.replace(/\D/g, ""))
    .refine((t) => t === "" || /^\d{12,13}$/.test(t)),
});

export async function criarCorretorAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await verificarAdministrador();
  const input = corretorSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) {
    return {
      erro: "Preencha nome, e-mail, senha de 8+ caracteres e, se houver, o WhatsApp com DDI (55DDDNÚMERO).",
    };
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

// Define (ou remove, se vazio) o WhatsApp do corretor que recebe os avisos
// de pendência do número de sistema.
export async function definirTelefoneAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await verificarAdministrador();
  const input = telefoneSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) {
    return { erro: "Informe o WhatsApp com DDI e DDD (ex.: 5588999990000)." };
  }
  const corretor = await definirTelefoneDoCorretor(
    session,
    input.data.corretorId,
    input.data.telefone || null,
  );
  if (!corretor) return { erro: "Corretor não encontrado." };
  revalidatePath("/admin/imobiliarias/[id]", "page");
  return { ok: true };
}
