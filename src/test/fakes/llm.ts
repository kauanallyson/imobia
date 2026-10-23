import {
  DIMENSOES_DO_EMBEDDING,
  type MensagemDoModelo,
  MODELO_DE_EMBEDDING,
  type RespostaDoModelo,
} from "@/lib/llm";

// Falso em memória de src/lib/llm.ts: mesma superfície, mais helpers de
// inspeção. Trocado pelo preload (src/test/fakes/preload.ts).

export { DIMENSOES_DO_EMBEDDING, MODELO_DE_EMBEDDING };
export type { MensagemDoModelo, RespostaDoModelo };

// Textos enviados para embedding, uma entrada por chamada.
export const embeddingsPedidos: string[][] = [];
// Fila de respostas roteirizadas para `responder` (ticket 09).
const roteiro: RespostaDoModelo[] = [];

export function limpar() {
  embeddingsPedidos.length = 0;
  roteiro.length = 0;
}

export function roteirizar(...respostas: RespostaDoModelo[]) {
  roteiro.push(...respostas);
}

export function proximaResposta(): RespostaDoModelo {
  const resposta = roteiro.shift();
  if (!resposta) throw new Error("llm falso: roteiro vazio");
  return resposta;
}

// Embedding determinístico: cada palavra (normalizada) é jogada por hash em
// algumas posições do vetor; textos que compartilham palavras ficam próximos
// no cosseno, textos sem palavras em comum ficam ortogonais.
export function embeddingFalso(texto: string): number[] {
  const vetor = new Array<number>(DIMENSOES_DO_EMBEDDING).fill(0);
  const palavras = texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .match(/[a-z0-9]{3,}/g);
  for (const palavra of palavras ?? []) {
    let h = 2166136261;
    for (const c of palavra) {
      h ^= c.charCodeAt(0);
      h = Math.imul(h, 16777619) >>> 0;
    }
    vetor[h % DIMENSOES_DO_EMBEDDING] += 1;
    vetor[(h >>> 11) % DIMENSOES_DO_EMBEDDING] += 0.5;
  }
  const norma = Math.hypot(...vetor) || 1;
  return vetor.map((v) => v / norma);
}

export async function gerarEmbeddings(textos: string[]): Promise<number[][]> {
  embeddingsPedidos.push([...textos]);
  return textos.map(embeddingFalso);
}
