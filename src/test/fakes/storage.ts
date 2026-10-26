import type { Conteudo } from "@/lib/storage";

// Falso em memória de src/lib/storage.ts: mesma superfície, mais `arquivos`
// para inspeção. Trocado pelo preload (src/test/fakes/preload.ts).

export type ArquivoSalvo = { bytes: Uint8Array; contentType: string };

export const arquivos = new Map<string, ArquivoSalvo>();

export function limpar() {
  arquivos.clear();
}

export async function salvarArquivo(
  chave: string,
  conteudo: Conteudo,
  contentType: string,
): Promise<void> {
  const bytes =
    conteudo instanceof Uint8Array
      ? conteudo
      : conteudo instanceof ArrayBuffer
        ? new Uint8Array(conteudo)
        : await new Response(conteudo).bytes();
  arquivos.set(chave, { bytes, contentType });
}

export async function apagarArquivo(chave: string): Promise<void> {
  arquivos.delete(chave);
}

export function urlAssinada(chave: string, ttlSeconds: number): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  return `fake://${chave}?exp=${exp}`;
}

export async function lerArquivo(chave: string): Promise<Uint8Array> {
  const arquivo = arquivos.get(chave);
  if (!arquivo) throw new Error(`storage falso: ${chave} não existe`);
  return arquivo.bytes;
}
