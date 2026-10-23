export type ToolCall = {
  /** Identifica a chamada para devolver o resultado ao modelo. */
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

// Papéis da conversa com o modelo, não termos do domínio: "input" é o que
// chega ao modelo (mensagens do cliente) e "model" é o que ele produziu.
export type LLMMessage =
  | { role: "input"; content: string }
  | { role: "model"; content: string | null; toolCalls: ToolCall[] }
  | { role: "toolResult"; toolCallId: string; content: string };

export type Tool = {
  name: string;
  description: string;
  /** JSON Schema dos argumentos. */
  parameters: Record<string, unknown>;
};

export type LLMRequest = {
  instructions: string;
  messages: LLMMessage[];
  tools: Tool[];
};

export type LLMResponse = {
  text: string | null;
  toolCalls: ToolCall[];
};

export interface LLM {
  respond(request: LLMRequest): Promise<LLMResponse>;
  embed(texts: string[]): Promise<number[][]>;
  transcribe(audio: Uint8Array, mimeType: string): Promise<string>;
}

/** Dimensão do text-embedding-3-small, usada pelas colunas pgvector. */
export const EMBEDDING_DIMENSIONS = 1536;

export class LLMFake implements LLM {
  readonly requests: LLMRequest[] = [];
  #responses: LLMResponse[] = [];
  #transcriptions: string[] = [];

  /** Enfileira a próxima resposta que `respond` devolverá. */
  scriptResponse(response: Partial<LLMResponse>) {
    this.#responses.push({
      text: response.text ?? null,
      toolCalls: response.toolCalls ?? [],
    });
  }

  scriptTranscription(text: string) {
    this.#transcriptions.push(text);
  }

  async respond(request: LLMRequest) {
    this.requests.push(request);
    const response = this.#responses.shift();
    if (!response) throw new Error("LLMFake: no scripted response");
    return response;
  }

  // Determinístico: o mesmo texto sempre gera o mesmo vetor.
  async embed(texts: string[]) {
    return texts.map((text) => {
      const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
      for (let i = 0; i < text.length; i++) {
        vector[i % EMBEDDING_DIMENSIONS] += text.charCodeAt(i);
      }
      const norm = Math.hypot(...vector) || 1;
      return vector.map((v) => v / norm);
    });
  }

  async transcribe() {
    const transcription = this.#transcriptions.shift();
    if (transcription === undefined) {
      throw new Error("LLMFake: no scripted transcription");
    }
    return transcription;
  }
}
