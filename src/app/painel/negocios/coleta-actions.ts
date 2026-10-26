"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { apagarDadosDoCliente, avaliarDocumento } from "@/data/coleta-de-dados";
import { verificarCorretor } from "@/data/session";

// Ticket 16: ações do corretor sobre a coleta de dados, no detalhe do
// negócio. "Levar ao estado X": repetir não altera.

export type FormState = { erro?: string; ok?: boolean };

function revalidarNegocio(id: string) {
  revalidatePath("/painel");
  revalidatePath(`/painel/negocios/${id}`);
}

const avaliarSchema = z.object({
  negocioId: z.uuid(),
  documentoId: z.uuid(),
  aceito: z.enum(["sim", "nao"]),
});

export async function avaliarDocumentoAction(formData: FormData) {
  const session = await verificarCorretor();
  const input = avaliarSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return;
  await avaliarDocumento(
    session,
    input.data.documentoId,
    input.data.aceito === "sim",
  );
  revalidarNegocio(input.data.negocioId);
}

const apagarSchema = z.object({
  negocioId: z.uuid(),
  clienteId: z.uuid(),
  confirmacao: z.literal("APAGAR"),
});

// Exclusão a pedido do cliente (LGPD): exige digitar APAGAR.
export async function apagarDadosDoClienteAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await verificarCorretor();
  const input = apagarSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) {
    return { erro: "Digite APAGAR para confirmar a exclusão." };
  }
  try {
    const apagado = await apagarDadosDoCliente(session, input.data.clienteId);
    if (!apagado) return { erro: "Cliente não encontrado." };
  } catch (error) {
    // Falha no R2 antes de anonimizar: nada foi marcado; repetir conclui.
    console.error("LGPD: falha ao apagar os dados do cliente", error);
    return {
      erro: "Não foi possível apagar os arquivos agora. Tente de novo.",
    };
  }
  revalidarNegocio(input.data.negocioId);
  return { ok: true };
}
