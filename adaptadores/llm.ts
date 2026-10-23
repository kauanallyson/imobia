export type ChamadaDeFerramenta = {
  /** Identifica a chamada para devolver o resultado ao modelo. */
  id: string;
  nome: string;
  argumentos: Record<string, unknown>;
};

// Papéis da conversa com o modelo, não termos do domínio: "entrada" é o que
// chega ao modelo (mensagens do cliente) e "modelo" é o que ele produziu.
export type MensagemDoLLM =
  | { papel: "entrada"; conteudo: string }
  | {
      papel: "modelo";
      conteudo: string | null;
      chamadasDeFerramenta: ChamadaDeFerramenta[];
    }
  | { papel: "resultadoDeFerramenta"; chamadaId: string; conteudo: string };

export type Ferramenta = {
  nome: string;
  descricao: string;
  /** JSON Schema dos argumentos. */
  parametros: Record<string, unknown>;
};

export type PedidoAoLLM = {
  instrucoes: string;
  mensagens: MensagemDoLLM[];
  ferramentas: Ferramenta[];
};

export type RespostaDoLLM = {
  texto: string | null;
  chamadasDeFerramenta: ChamadaDeFerramenta[];
};

export interface LLM {
  responder(pedido: PedidoAoLLM): Promise<RespostaDoLLM>;
  gerarEmbeddings(textos: string[]): Promise<number[][]>;
  transcreverAudio(audio: Uint8Array, mimeType: string): Promise<string>;
}

/** Dimensão do text-embedding-3-small, usada pelas colunas pgvector. */
export const DIMENSAO_DOS_EMBEDDINGS = 1536;

export class LLMFalso implements LLM {
  readonly pedidos: PedidoAoLLM[] = [];
  #respostas: RespostaDoLLM[] = [];
  #transcricoes: string[] = [];

  /** Enfileira a próxima resposta que `responder` devolverá. */
  roteirizarResposta(resposta: Partial<RespostaDoLLM>) {
    this.#respostas.push({
      texto: resposta.texto ?? null,
      chamadasDeFerramenta: resposta.chamadasDeFerramenta ?? [],
    });
  }

  roteirizarTranscricao(texto: string) {
    this.#transcricoes.push(texto);
  }

  async responder(pedido: PedidoAoLLM) {
    this.pedidos.push(pedido);
    const resposta = this.#respostas.shift();
    if (!resposta) throw new Error("LLMFalso: nenhuma resposta roteirizada");
    return resposta;
  }

  // Determinístico: o mesmo texto sempre gera o mesmo vetor.
  async gerarEmbeddings(textos: string[]) {
    return textos.map((texto) => {
      const vetor = new Array<number>(DIMENSAO_DOS_EMBEDDINGS).fill(0);
      for (let i = 0; i < texto.length; i++) {
        vetor[i % DIMENSAO_DOS_EMBEDDINGS] += texto.charCodeAt(i);
      }
      const norma = Math.hypot(...vetor) || 1;
      return vetor.map((v) => v / norma);
    });
  }

  async transcreverAudio() {
    const transcricao = this.#transcricoes.shift();
    if (transcricao === undefined) {
      throw new Error("LLMFalso: nenhuma transcrição roteirizada");
    }
    return transcricao;
  }
}
