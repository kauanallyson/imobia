"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  criarEmpreendimento,
  editarEmpreendimento,
} from "@/data/empreendimentos";
import { criarIncorporadora, editarIncorporadora } from "@/data/incorporadoras";
import {
  alterarStatusDoLote,
  criarLote,
  editarLote,
  LoteDuplicadoError,
} from "@/data/lotes";
import { criarModeloDeCasa, editarModeloDeCasa } from "@/data/modelos-de-casa";
import { verificarCorretor } from "@/data/session";
import { statusDeLote } from "@/lib/db/schema";

export type FormState = { erro?: string; ok?: boolean };

const texto = z.string().trim().min(1);
const medida = z.coerce.number().positive();
const inteiro = z.coerce.number().int().min(0);

function formulario(formData: FormData) {
  return Object.fromEntries(formData);
}

// ---- Incorporadoras --------------------------------------------------------

const incorporadoraSchema = z.object({ id: z.uuid(), nome: texto });

export async function criarIncorporadoraAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await verificarCorretor();
  const input = incorporadoraSchema.safeParse(formulario(formData));
  if (!input.success) return { erro: "Informe o nome da incorporadora." };

  if (!(await criarIncorporadora(session, input.data))) {
    return { erro: "Não foi possível criar a incorporadora." };
  }
  revalidatePath("/painel/catalogo");
  return { ok: true };
}

export async function editarIncorporadoraAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await verificarCorretor();
  const input = incorporadoraSchema.safeParse(formulario(formData));
  if (!input.success) return { erro: "Informe o nome da incorporadora." };

  const { id, ...dados } = input.data;
  if (!(await editarIncorporadora(session, id, dados))) {
    return { erro: "Incorporadora não encontrada." };
  }
  revalidatePath("/painel/catalogo", "layout");
  return { ok: true };
}

// ---- Empreendimentos -------------------------------------------------------

const empreendimentoSchema = z.object({
  id: z.uuid(),
  incorporadoraId: z.uuid(),
  nome: texto,
  cidade: texto,
  endereco: texto,
});
const erroEmpreendimento =
  "Preencha nome, cidade, endereço e escolha a incorporadora.";

export async function criarEmpreendimentoAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await verificarCorretor();
  const input = empreendimentoSchema.safeParse(formulario(formData));
  if (!input.success) return { erro: erroEmpreendimento };

  if (!(await criarEmpreendimento(session, input.data))) {
    return { erro: "Incorporadora não encontrada." };
  }
  revalidatePath("/painel/catalogo");
  return { ok: true };
}

export async function editarEmpreendimentoAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await verificarCorretor();
  const input = empreendimentoSchema.safeParse(formulario(formData));
  if (!input.success) return { erro: erroEmpreendimento };

  const { id, ...dados } = input.data;
  if (!(await editarEmpreendimento(session, id, dados))) {
    return { erro: "Empreendimento ou incorporadora não encontrados." };
  }
  revalidatePath("/painel/catalogo", "layout");
  return { ok: true };
}

// ---- Lotes -----------------------------------------------------------------

const loteSchema = z.object({
  id: z.uuid(),
  empreendimentoId: z.uuid(),
  quadra: texto,
  numero: texto,
  area: medida,
  frente: medida,
  fundo: medida,
  preco: medida,
});
const erroLote = "Preencha quadra, número, medidas e preço (maiores que zero).";

export async function criarLoteAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await verificarCorretor();
  const input = loteSchema.safeParse(formulario(formData));
  if (!input.success) return { erro: erroLote };

  try {
    if (!(await criarLote(session, input.data))) {
      return { erro: "Empreendimento não encontrado." };
    }
  } catch (error) {
    if (error instanceof LoteDuplicadoError) {
      return { erro: "Já existe um lote com essa quadra e número." };
    }
    throw error;
  }
  revalidatePath("/painel/catalogo/empreendimentos/[id]", "page");
  return { ok: true };
}

export async function editarLoteAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await verificarCorretor();
  const input = loteSchema.safeParse(formulario(formData));
  if (!input.success) return { erro: erroLote };

  const { id, empreendimentoId: _e, ...dados } = input.data;
  try {
    if (!(await editarLote(session, id, dados))) {
      return { erro: "Lote não encontrado." };
    }
  } catch (error) {
    if (error instanceof LoteDuplicadoError) {
      return { erro: "Já existe um lote com essa quadra e número." };
    }
    throw error;
  }
  revalidatePath("/painel/catalogo", "layout");
  return { ok: true };
}

const statusSchema = z.object({
  loteId: z.uuid(),
  status: z.enum(statusDeLote),
});

// Botão simples: leva o lote ao status escolhido (repetir não muda nada).
export async function alterarStatusDoLoteAction(formData: FormData) {
  const session = await verificarCorretor();
  const input = statusSchema.safeParse(formulario(formData));
  if (!input.success) return;

  await alterarStatusDoLote(session, input.data.loteId, input.data.status);
  revalidatePath("/painel/catalogo", "layout");
}

// ---- Modelos de casa -------------------------------------------------------

const modeloSchema = z.object({
  id: z.uuid(),
  empreendimentoId: z.uuid(),
  nome: texto,
  areaConstruida: medida,
  quartos: inteiro,
  banheiros: inteiro,
  suites: inteiro,
  vagas: inteiro,
  preco: medida,
});
const erroModelo =
  "Preencha nome, área construída, quantidades (0 ou mais) e preço.";

export async function criarModeloDeCasaAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await verificarCorretor();
  const input = modeloSchema.safeParse(formulario(formData));
  if (!input.success) return { erro: erroModelo };

  if (!(await criarModeloDeCasa(session, input.data))) {
    return { erro: "Empreendimento não encontrado." };
  }
  revalidatePath("/painel/catalogo/empreendimentos/[id]", "page");
  return { ok: true };
}

export async function editarModeloDeCasaAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await verificarCorretor();
  const input = modeloSchema.safeParse(formulario(formData));
  if (!input.success) return { erro: erroModelo };

  const { id, empreendimentoId: _e, ...dados } = input.data;
  if (!(await editarModeloDeCasa(session, id, dados))) {
    return { erro: "Modelo de casa não encontrado." };
  }
  revalidatePath("/painel/catalogo", "layout");
  return { ok: true };
}
