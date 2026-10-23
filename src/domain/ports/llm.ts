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
