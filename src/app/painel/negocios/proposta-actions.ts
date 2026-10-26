"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { OptOutError } from "@/data/assistente/contexto";
import { LoteIndisponivelError } from "@/data/coleta-de-dados";
import {
  aprovarProposta,
  ColetaIncompletaError,
  gerarProposta,
  PrazoDaReservaInvalidoError,
  prorrogarReserva,
  SemModeloDePropostaError,
  SemWhatsappError,
} from "@/data/propostas";
import { verificarCorretor } from "@/data/session";

// Ticket 17: proposta e reserva no detalhe do negócio. Gerar é idempotente
// (uma proposta viva por negócio) e aprovar é "levar a enviada".

export type FormState = { erro?: string; ok?: boolean };

function revalidarNegocio(id: string) {
  revalidatePath("/painel");
  revalidatePath(`/painel/negocios/${id}`);
  revalidatePath("/painel/pendencias");
}

function mensagemDeErro(error: unknown): string | null {
  if (error instanceof ColetaIncompletaError) return `${error.message}.`;
  if (error instanceof LoteIndisponivelError) {
    return `${error.message}. Escolha outro lote para o cliente.`;
  }
  if (error instanceof SemModeloDePropostaError) {
    return "A incorporadora ainda não tem modelo de proposta: envie o DOCX no catálogo.";
  }
  if (error instanceof SemWhatsappError) {
    return "Não há conversa no WhatsApp com este cliente para enviar a proposta.";
  }
  if (error instanceof OptOutError) {
    return "O cliente pediu para não receber mais mensagens: a proposta não foi enviada.";
  }
  if (error instanceof PrazoDaReservaInvalidoError) return `${error.message}.`;
  return null;
}

const gerarSchema = z.object({ negocioId: z.uuid(), propostaId: z.uuid() });

export async function gerarPropostaAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await verificarCorretor();
  const input = gerarSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return { erro: "Negócio inválido." };
  try {
    const proposta = await gerarProposta(session, input.data.negocioId, {
      id: input.data.propostaId,
    });
    if (!proposta) return { erro: "Negócio não encontrado." };
  } catch (error) {
    const erro = mensagemDeErro(error);
    if (erro) return { erro };
    console.error("proposta: falha ao gerar", error);
    return { erro: "Não foi possível gerar o PDF agora. Tente de novo." };
  }
  revalidarNegocio(input.data.negocioId);
  return { ok: true };
}

export async function aprovarPropostaAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await verificarCorretor();
  const input = gerarSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return { erro: "Proposta inválida." };
  try {
    const proposta = await aprovarProposta(session, input.data.propostaId);
    if (!proposta) return { erro: "Proposta não encontrada." };
  } catch (error) {
    const erro = mensagemDeErro(error);
    if (erro) return { erro };
    console.error("proposta: falha ao aprovar", error);
    return { erro: "Não foi possível enviar a proposta agora. Tente de novo." };
  }
  revalidarNegocio(input.data.negocioId);
  return { ok: true };
}

const prorrogarSchema = z.object({
  negocioId: z.uuid(),
  reservaId: z.uuid(),
  // Nova expiração calculada na renderização: reenviar não soma de novo.
  expiraEm: z.iso.datetime({ offset: true }),
});

export async function prorrogarReservaAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await verificarCorretor();
  const input = prorrogarSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return { erro: "Prazo inválido." };
  try {
    const reserva = await prorrogarReserva(session, input.data.reservaId, {
      expiraEm: new Date(input.data.expiraEm),
    });
    if (!reserva) return { erro: "Reserva não encontrada." };
  } catch (error) {
    const erro = mensagemDeErro(error);
    if (erro) return { erro };
    throw error;
  }
  revalidarNegocio(input.data.negocioId);
  return { ok: true };
}
