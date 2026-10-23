import {
  EMBEDDING_DIMENSIONS,
  type LLM,
  type LLMRequest,
  type LLMResponse,
} from "@/domain/ports/llm";

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
