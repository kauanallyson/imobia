import {
  type ChamadaDeFerramenta,
  DIMENSOES_DO_EMBEDDING,
  type FerramentaDoModelo,
  type MensagemDoModelo,
  MODELO_DE_EMBEDDING,
  MODELO_DE_TRANSCRICAO,
  MODELO_DO_ASSISTENTE,
  type PedidoAoModelo,
  type RespostaDoModelo,
  type ResultadoDeFerramenta,
} from "@/lib/llm";

// Falso em memória de src/lib/llm.ts: mesma superfície, mais helpers de
// inspeção. Trocado pelo preload (src/test/fakes/preload.ts).

export {
  DIMENSOES_DO_EMBEDDING,
  MODELO_DE_EMBEDDING,
  MODELO_DE_TRANSCRICAO,
  MODELO_DO_ASSISTENTE,
};
export type {
  FerramentaDoModelo,
  MensagemDoModelo,
  PedidoAoModelo,
  RespostaDoModelo,
  ResultadoDeFerramenta,
};

// Textos enviados para embedding, uma entrada por chamada.
export const embeddingsPedidos: string[][] = [];

// O que o teste roteiriza para cada rodada do modelo: um texto final ou uma
// lista de ferramentas a chamar (ids opcionais, o falso preenche).
export type Roteiro =
  | { tipo: "texto"; texto: string }
  | {
      tipo: "chamadas";
      chamadas: Array<{ id?: string; nome: string; argumentos: unknown }>;
    };

// Fila de rodadas roteirizadas, consumidas em ordem por `responder`.
const roteiro: Roteiro[] = [];
// Tudo que o assistente mandou ao modelo, para inspeção (instruções,
// histórico, ferramentas oferecidas e resultados devolvidos).
export const pedidos: PedidoAoModelo[] = [];

// Transcrições roteirizadas (texto ou falha), consumidas em ordem, e os
// áudios recebidos para inspeção.
const transcricoes: Array<string | Error> = [];
export const transcricoesPedidas: Array<{
  bytes: Uint8Array;
  mimeType: string;
}> = [];

let contador = 0;

export function limpar() {
  embeddingsPedidos.length = 0;
  roteiro.length = 0;
  pedidos.length = 0;
  transcricoes.length = 0;
  transcricoesPedidas.length = 0;
  contador = 0;
}

export function roteirizarTranscricao(...textos: string[]) {
  transcricoes.push(...textos);
}

// A próxima transcrição falha (como a OpenAI fora do ar ou áudio ilegível).
export function falharTranscricao(mensagem = "llm falso: transcrição falhou") {
  transcricoes.push(new Error(mensagem));
}

export async function transcrever(audio: {
  bytes: Uint8Array;
  mimeType: string;
}): Promise<string> {
  transcricoesPedidas.push({ ...audio });
  const proxima = transcricoes.shift();
  if (!proxima) throw new Error("llm falso: nenhuma transcrição roteirizada");
  if (proxima instanceof Error) throw proxima;
  return proxima;
}

export function roteirizar(...rodadas: Roteiro[]) {
  roteiro.push(...rodadas);
}

export async function responder(
  pedido: PedidoAoModelo,
): Promise<RespostaDoModelo> {
  pedidos.push(structuredClone(pedido));
  const rodada = roteiro.shift();
  if (!rodada) throw new Error("llm falso: roteiro vazio");
  const responseId = `resp-falsa-${++contador}`;
  if (rodada.tipo === "texto") {
    return { tipo: "texto", texto: rodada.texto, responseId };
  }
  const chamadas: ChamadaDeFerramenta[] = rodada.chamadas.map((c, i) => ({
    id: c.id ?? `${responseId}-call-${i}`,
    nome: c.nome,
    argumentos: c.argumentos,
  }));
  return { tipo: "chamadas", chamadas, responseId };
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
