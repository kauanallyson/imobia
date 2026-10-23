import { S3Client } from "bun";
import { env } from "@/lib/env";

// Único módulo que conhece o Cloudflare R2 (spec → Storage): S3Client nativo
// do Bun, sem SDK da AWS. O resto do sistema só vê estas funções; em testes o
// módulo inteiro é trocado por src/test/fakes/storage.ts.

export type Conteudo = Uint8Array | ArrayBuffer | Blob | ReadableStream;

let client: S3Client | undefined;

function r2() {
  client ??= new S3Client({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    bucket: env.R2_BUCKET,
    endpoint:
      env.R2_ENDPOINT ??
      `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    region: "auto",
  });
  return client;
}

export async function salvarArquivo(
  chave: string,
  conteudo: Conteudo,
  contentType: string,
): Promise<void> {
  const dados =
    conteudo instanceof ReadableStream ? new Response(conteudo) : conteudo;
  await r2().write(chave, dados, { type: contentType });
}

// Idempotente: apagar o que não existe não é erro.
export async function apagarArquivo(chave: string): Promise<void> {
  await r2().delete(chave);
}

// Assinatura local (sem rede); bucket privado, URL de curta duração.
export function urlAssinada(chave: string, ttlSeconds: number): string {
  return r2().presign(chave, { method: "GET", expiresIn: ttlSeconds });
}
