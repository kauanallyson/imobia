import OpenAI from "openai";
import { env } from "@/lib/env";

// Único módulo que conhece o SDK da OpenAI. O resto do sistema só vê estas
// funções; em testes o módulo inteiro é trocado por src/test/fakes/llm.ts.

export const MODELO_DE_EMBEDDING = "text-embedding-3-small";
export const DIMENSOES_DO_EMBEDDING = 1536;

let cliente: OpenAI | undefined;
function openai() {
  cliente ??= new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return cliente;
}

// Um vetor de 1536 posições por texto, na mesma ordem da entrada.
export async function gerarEmbeddings(textos: string[]): Promise<number[][]> {
  if (textos.length === 0) return [];
  const { data } = await openai().embeddings.create({
    model: MODELO_DE_EMBEDDING,
    input: textos,
    dimensions: DIMENSOES_DO_EMBEDDING,
  });
  return data.sort((a, b) => a.index - b.index).map((item) => item.embedding);
}

// --- Formas que os próximos tickets preenchem --------------------------------
// TODO(ticket 09): `responder` — Responses API (`gpt-6-luna`) com tool calling;
// devolve texto ou chamadas de ferramenta a partir do histórico da conversa.
// TODO(ticket 19): `transcrever` — transcrição de áudio do WhatsApp.
// Mantidas aqui só como tipos para o falso ter a mesma superfície desde já.

export type MensagemDoModelo = {
  papel: "sistema" | "usuario" | "assistente";
  texto: string;
};

export type ChamadaDeFerramenta = {
  id: string;
  nome: string;
  argumentos: unknown;
};

export type RespostaDoModelo =
  | { tipo: "texto"; texto: string }
  | { tipo: "ferramentas"; chamadas: ChamadaDeFerramenta[] };
