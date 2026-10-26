"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  enviarMaterialDeMarketing,
  removerMaterialDeMarketing,
  type TipoDeArquivo,
} from "@/data/materiais-de-marketing";
import { verificarCorretor } from "@/data/session";
import { destinosDoMaterial } from "@/lib/db/schema";
import type { FormState } from "../../../actions";

// Limite do arquivo; `serverActions.bodySizeLimit` (next.config.ts) deixa
// folga para o multipart.
const TAMANHO_MAXIMO = 25 * 1024 * 1024;

const materialSchema = z.object({
  id: z.uuid(),
  empreendimentoId: z.uuid(),
  nome: z.string().trim(),
  destino: z.enum(destinosDoMaterial),
  arquivo: z.instanceof(File).refine((f) => f.size > 0, "arquivo vazio"),
});

// Só PDF, imagem e vídeo (spec → história 17).
function tipoDoArquivo(contentType: string): TipoDeArquivo | null {
  if (contentType === "application/pdf") return "pdf";
  if (contentType.startsWith("image/")) return "imagem";
  if (contentType.startsWith("video/")) return "video";
  return null;
}

const paginaDeMateriais = "/painel/catalogo/empreendimentos/[id]/materiais";

export async function enviarMaterialAction(
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await verificarCorretor();
  const input = materialSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return { erro: "Escolha um arquivo e o destino." };

  const { arquivo, nome, ...dados } = input.data;
  if (arquivo.size > TAMANHO_MAXIMO) {
    return { erro: "O arquivo passa de 25 MB." };
  }
  const tipoDeArquivo = tipoDoArquivo(arquivo.type);
  if (!tipoDeArquivo) return { erro: "Envie um PDF, uma imagem ou um vídeo." };

  const material = await enviarMaterialDeMarketing(session, {
    ...dados,
    nome: nome || arquivo.name,
    tipoDeArquivo,
    contentType: arquivo.type,
    conteudo: arquivo,
  });
  if (!material) return { erro: "Empreendimento não encontrado." };
  revalidatePath(paginaDeMateriais, "page");
  return { ok: true };
}

const removerSchema = z.object({ materialId: z.uuid() });

// Botão simples: remover de novo não falha.
export async function removerMaterialAction(formData: FormData) {
  const session = await verificarCorretor();
  const input = removerSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return;

  await removerMaterialDeMarketing(session, input.data.materialId);
  revalidatePath(paginaDeMateriais, "page");
}
