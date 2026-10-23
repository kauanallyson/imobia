import OpenAI from "openai";
import { env } from "@/lib/env";

// Único módulo que conhece o SDK da OpenAI. O resto do sistema só vê estas
// funções; em testes o módulo inteiro é trocado por src/test/fakes/llm.ts.

export const MODELO_DE_EMBEDDING = "text-embedding-3-small";
export const DIMENSOES_DO_EMBEDDING = 1536;
// Modelo do assistente (spec → Integrações → LLM), pela Responses API.
export const MODELO_DO_ASSISTENTE = "gpt-6-luna";

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

// --- Assistente (Responses API com tool calling) ----------------------------

export type MensagemDoModelo = {
  papel: "usuario" | "assistente";
  texto: string;
};

// Ferramenta como o modelo a vê: nome, descrição e JSON Schema dos
// parâmetros. Quem executa é src/data/assistente (o modelo só pede).
export type FerramentaDoModelo = {
  nome: string;
  descricao: string;
  parametros: Record<string, unknown>;
};

export type ChamadaDeFerramenta = {
  id: string;
  nome: string;
  argumentos: unknown;
};

export type ResultadoDeFerramenta = {
  chamadaId: string;
  resultado: unknown;
};

export type RespostaDoModelo = (
  | { tipo: "texto"; texto: string }
  | { tipo: "chamadas"; chamadas: ChamadaDeFerramenta[] }
) & {
  // Id da response, para encadear os resultados das ferramentas.
  responseId: string;
};

export type PedidoAoModelo = {
  instrucoes: string;
  historico: MensagemDoModelo[];
  ferramentas: FerramentaDoModelo[];
  // Depois de executar as chamadas de uma resposta anterior, devolve os
  // resultados encadeados a ela (previous_response_id); o histórico e as
  // instruções são ignorados pela API nesse caso, mas seguem obrigatórios
  // para a primeira chamada.
  respostaAnterior?: {
    responseId: string;
    resultados: ResultadoDeFerramenta[];
  };
};

// Uma rodada do modelo: ou ele responde em texto, ou pede ferramentas. O
// chamador executa as ferramentas e chama de novo com `respostaAnterior`.
export async function responder(
  pedido: PedidoAoModelo,
): Promise<RespostaDoModelo> {
  const tools: OpenAI.Responses.Tool[] = pedido.ferramentas.map((f) => ({
    type: "function",
    name: f.nome,
    description: f.descricao,
    parameters: f.parametros,
    strict: false,
  }));

  const input: OpenAI.Responses.ResponseInputItem[] = pedido.respostaAnterior
    ? pedido.respostaAnterior.resultados.map((r) => ({
        type: "function_call_output",
        call_id: r.chamadaId,
        output: JSON.stringify(r.resultado ?? null),
      }))
    : pedido.historico.map((m) => ({
        role: m.papel === "usuario" ? "user" : "assistant",
        content: m.texto,
      }));

  const response = await openai().responses.create({
    model: MODELO_DO_ASSISTENTE,
    instructions: pedido.instrucoes,
    input,
    tools,
    store: true,
    previous_response_id: pedido.respostaAnterior?.responseId,
  });

  const chamadas: ChamadaDeFerramenta[] = [];
  for (const item of response.output) {
    if (item.type !== "function_call") continue;
    let argumentos: unknown = {};
    try {
      argumentos = JSON.parse(item.arguments || "{}");
    } catch {
      argumentos = { erro: "argumentos inválidos", bruto: item.arguments };
    }
    chamadas.push({ id: item.call_id, nome: item.name, argumentos });
  }
  if (chamadas.length > 0) {
    return { tipo: "chamadas", chamadas, responseId: response.id };
  }
  return {
    tipo: "texto",
    texto: response.output_text.trim(),
    responseId: response.id,
  };
}

// TODO(ticket 19): `transcrever` — transcrição de áudio do WhatsApp.
