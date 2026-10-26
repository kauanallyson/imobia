"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { definirInstrucoesDePagamento } from "@/data/incorporadoras";
import {
  enviarModeloDeProposta,
  ModeloDePropostaInvalidoError,
} from "@/data/propostas";
import { verificarCorretor } from "@/data/session";
import type { FormState } from "../../actions";

// Ticket 17: modelo DOCX da proposta da incorporadora.
const TAMANHO_MAXIMO = 10 * 1024 * 1024;

const modeloSchema = z.object({
  incorporadoraId: z.uuid(),
  arquivo: z.instanceof(File).refine((f) => f.size > 0, "arquivo vazio"),
});

export async function enviarModeloDePropostaAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await verificarCorretor();
  const input = modeloSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return { erro: "Escolha o arquivo DOCX do modelo." };
  const { arquivo, incorporadoraId } = input.data;
  if (arquivo.size > TAMANHO_MAXIMO) {
    return { erro: "O arquivo passa de 10 MB." };
  }
  try {
    const modelo = await enviarModeloDeProposta(session, {
      incorporadoraId,
      nomeDoArquivo: arquivo.name,
      conteudo: new Uint8Array(await arquivo.arrayBuffer()),
    });
    if (!modelo) return { erro: "Incorporadora não encontrada." };
  } catch (error) {
    if (error instanceof ModeloDePropostaInvalidoError) {
      return { erro: "O arquivo não é um DOCX válido (Word)." };
    }
    throw error;
  }
  revalidatePath("/painel/catalogo/incorporadoras/[id]", "page");
  return { ok: true };
}

// Ticket 18: instruções reutilizáveis de pagamento da entrada.
const instrucoesSchema = z.object({
  incorporadoraId: z.uuid(),
  instrucoes: z.string().max(4000),
});

export async function definirInstrucoesDePagamentoAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await verificarCorretor();
  const input = instrucoesSchema.safeParse(Object.fromEntries(formData));
  if (!input.success)
    return { erro: "Instruções inválidas (até 4000 caracteres)." };
  const salvo = await definirInstrucoesDePagamento(
    session,
    input.data.incorporadoraId,
    input.data.instrucoes,
  );
  if (!salvo) return { erro: "Incorporadora não encontrada." };
  revalidatePath("/painel/catalogo/incorporadoras/[id]", "page");
  return { ok: true };
}
