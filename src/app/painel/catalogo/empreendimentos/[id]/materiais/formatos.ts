import type { DestinoDoMaterial, TipoDeArquivo } from "@/lib/db/schema";

export const rotuloDoDestino: Record<DestinoDoMaterial, string> = {
  lote: "Lote",
  lote_e_casa: "Lote + casa",
  ambos: "Ambos",
};

export const rotuloDoTipo: Record<TipoDeArquivo, string> = {
  pdf: "PDF",
  imagem: "Imagem",
  video: "Vídeo",
};

export function formatarTamanho(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
}
