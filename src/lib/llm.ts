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

// --- Transcrição de áudio ---------------------------------------------------

// Modelo de transcrição (integrations.md): `gpt-transcribe`; whisper-1 e os
// gpt-4o-*-transcribe estão deprecados. Configurável por env.
export const MODELO_DE_TRANSCRICAO = env.OPENAI_TRANSCRIBE_MODEL;

// Extensão que a API usa para reconhecer o formato; áudio do WhatsApp (ptt) é
// `audio/ogg; codecs=opus`, aceito como .ogg.
function extensaoDe(mimeType: string) {
  const base = mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  const mapa: Record<string, string> = {
    "audio/ogg": "ogg",
    "audio/opus": "ogg",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/mp4": "m4a",
    "audio/x-m4a": "m4a",
    "audio/aac": "m4a",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/webm": "webm",
    "audio/flac": "flac",
  };
  return mapa[base] ?? "ogg";
}

// Texto do áudio em português. Lança em qualquer falha (quem chama decide o
// que dizer ao cliente).
export async function transcrever(audio: {
  bytes: Uint8Array;
  mimeType: string;
}): Promise<string> {
  const tipo = audio.mimeType.split(";")[0]?.trim() || "audio/ogg";
  const file = new File(
    [Uint8Array.from(audio.bytes)],
    `audio.${extensaoDe(audio.mimeType)}`,
    {
      type: tipo,
    },
  );
  const resultado = await openai().audio.transcriptions.create({
    file,
    model: MODELO_DE_TRANSCRICAO,
    response_format: "json",
    // gpt-transcribe usa `languages`; os modelos antigos usavam `language`.
    ...(MODELO_DE_TRANSCRICAO.startsWith("gpt-transcribe")
      ? { languages: ["pt"] }
      : { language: "pt" }),
  } as Parameters<typeof OpenAI.prototype.audio.transcriptions.create>[0]);
  const texto = (resultado as { text?: string }).text?.trim();
  if (!texto) throw new Error("transcrição vazia");
  return texto;
}

// --- Legibilidade de documento (ticket 16) ----------------------------------

export type TipoDeDocumentoAvaliado = "cpf" | "rg" | "comprovante_endereco";

export type AvaliacaoDeLegibilidade = {
  legivel: boolean;
  // Por que parece ilegível (ou o que foi visto), em português.
  motivo: string | null;
};

const nomeDoDocumento: Record<TipoDeDocumentoAvaliado, string> = {
  cpf: "CPF (ou documento com o número do CPF)",
  rg: "RG (documento de identidade)",
  comprovante_endereco: "comprovante de endereço",
};

// Modelo multimodal: só presença e legibilidade, nunca autenticidade (spec →
// Documentos). Imagens vão como input_image; PDF como input_file. Lança em
// qualquer falha (quem chama grava "não avaliado").
export async function avaliarLegibilidade(documento: {
  bytes: Uint8Array;
  mimeType: string;
  tipo: TipoDeDocumentoAvaliado;
}): Promise<AvaliacaoDeLegibilidade> {
  const tipo = documento.mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  const dataUrl = `data:${tipo};base64,${Buffer.from(documento.bytes).toString("base64")}`;
  const arquivo: OpenAI.Responses.ResponseInputContent =
    tipo === "application/pdf"
      ? {
          type: "input_file",
          filename: "documento.pdf",
          file_data: dataUrl,
        }
      : { type: "input_image", image_url: dataUrl, detail: "high" };

  const response = await openai().responses.create({
    model: MODELO_DO_ASSISTENTE,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `O arquivo deveria ser um ${nomeDoDocumento[documento.tipo]}. Diga se ele é esse documento e se está legível (nome, números e datas dá para ler, sem cortes, borrões ou reflexos). Não avalie autenticidade. Responda em português.`,
          },
          arquivo,
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "legibilidade",
        strict: true,
        schema: {
          type: "object",
          properties: {
            legivel: { type: "boolean" },
            motivo: { type: ["string", "null"] },
          },
          required: ["legivel", "motivo"],
          additionalProperties: false,
        },
      },
    },
  });
  const resultado = JSON.parse(response.output_text) as AvaliacaoDeLegibilidade;
  if (typeof resultado.legivel !== "boolean") {
    throw new Error("legibilidade: resposta inválida do modelo");
  }
  return { legivel: resultado.legivel, motivo: resultado.motivo ?? null };
}
