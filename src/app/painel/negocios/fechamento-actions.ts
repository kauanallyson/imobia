"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  confirmarAssinatura,
  confirmarPagamento,
  ForaDaEtapaError,
  rejeitarAssinatura,
  SemInstrucoesDePagamentoError,
  SemPropostaAssinadaError,
} from "@/data/assinatura-e-pagamento";
import { OptOutError } from "@/data/assistente/contexto";
import { LoteIndisponivelError } from "@/data/coleta-de-dados";
import { SemWhatsappError } from "@/data/propostas";
import { verificarCorretor } from "@/data/session";

// Ticket 18: decisões do corretor sobre assinatura e pagamento no detalhe do
// negócio. Todas são "levar ao estado X": repetir não muda nada.

export type FormState = { erro?: string; ok?: boolean };

const schema = z.object({
  negocioId: z.uuid(),
  acao: z.enum([
    "confirmar_assinatura",
    "rejeitar_assinatura",
    "confirmar_pagamento",
  ]),
});

const acoes = {
  confirmar_assinatura: confirmarAssinatura,
  rejeitar_assinatura: rejeitarAssinatura,
  confirmar_pagamento: confirmarPagamento,
};

function mensagemDeErro(error: unknown): string | null {
  if (error instanceof SemInstrucoesDePagamentoError) {
    return "Cadastre as instruções de pagamento da incorporadora no catálogo antes de confirmar.";
  }
  if (error instanceof SemPropostaAssinadaError) return `${error.message}.`;
  if (error instanceof ForaDaEtapaError) return `${error.message}.`;
  if (error instanceof LoteIndisponivelError) return `${error.message}.`;
  if (error instanceof SemWhatsappError) {
    return "Não há conversa no WhatsApp com este cliente.";
  }
  if (error instanceof OptOutError) {
    return "O cliente pediu para não receber mais mensagens: nada foi enviado.";
  }
  return null;
}

export async function fechamentoAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await verificarCorretor();
  const input = schema.safeParse(Object.fromEntries(formData));
  if (!input.success) return { erro: "Ação inválida." };
  const { negocioId, acao } = input.data;
  try {
    const resultado = await acoes[acao](session, negocioId);
    if (!resultado) return { erro: "Negócio não encontrado." };
  } catch (error) {
    const erro = mensagemDeErro(error);
    if (erro) return { erro };
    console.error(`fechamento: falha em ${acao}`, error);
    return { erro: "Não foi possível concluir agora. Tente de novo." };
  }
  revalidatePath("/painel");
  revalidatePath(`/painel/negocios/${negocioId}`);
  revalidatePath("/painel/pendencias");
  return { ok: true };
}
