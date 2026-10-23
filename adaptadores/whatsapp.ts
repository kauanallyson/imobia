// ADR-0004: nenhum outro módulo conhece a Evolution API; trocar para a
// Cloud API oficial deve exigir só uma nova implementação desta interface.

export type EstadoDaConexao = "conectado" | "conectando" | "desconectado";

export type TipoDeMidia = "imagem" | "video" | "audio" | "documento";

export type MensagemRecebida = {
  instancia: string;
  /** Telefone do outro lado da conversa, em formato E.164 sem "+". */
  telefone: string;
  /** true quando enviada pelo celular do próprio corretor. */
  fromMe: boolean;
  grupo: boolean;
  recebidaEm: Date;
  texto?: string;
  midia?: { tipo: TipoDeMidia; url: string; mimeType: string };
};

export type MensagemEnviada =
  | { tipo: "texto"; instancia: string; telefone: string; texto: string }
  | {
      tipo: "midia";
      instancia: string;
      telefone: string;
      midia: TipoDeMidia;
      url: string;
      legenda?: string;
    }
  | {
      tipo: "localizacao";
      instancia: string;
      telefone: string;
      latitude: number;
      longitude: number;
      nome?: string;
      endereco?: string;
    };

type SemTipo<T> = T extends unknown ? Omit<T, "tipo"> : never;
type Envio<T extends MensagemEnviada["tipo"]> = SemTipo<
  Extract<MensagemEnviada, { tipo: T }>
>;

export interface WhatsApp {
  /** Cria ou reconecta a instância e devolve o QR code a ser lido. */
  conectar(instancia: string): Promise<{ qrCode: string }>;
  estadoDaConexao(instancia: string): Promise<EstadoDaConexao>;
  enviarTexto(envio: Envio<"texto">): Promise<void>;
  enviarMidia(envio: Envio<"midia">): Promise<void>;
  enviarLocalizacao(envio: Envio<"localizacao">): Promise<void>;
  /** Registra quem trata mensagens recebidas; devolve função para cancelar. */
  aoReceberMensagem(
    tratar: (mensagem: MensagemRecebida) => Promise<void>,
  ): () => void;
}

export class WhatsAppFalso implements WhatsApp {
  readonly enviadas: MensagemEnviada[] = [];
  readonly estados = new Map<string, EstadoDaConexao>();
  #tratadores = new Set<(mensagem: MensagemRecebida) => Promise<void>>();

  // Fica "conectando" até o teste definir outro estado em `estados`,
  // como faria a leitura do QR code.
  async conectar(instancia: string) {
    this.estados.set(instancia, "conectando");
    return { qrCode: `qr-code-falso:${instancia}` };
  }

  async estadoDaConexao(instancia: string) {
    return this.estados.get(instancia) ?? "desconectado";
  }

  async enviarTexto(envio: Envio<"texto">) {
    this.enviadas.push({ tipo: "texto", ...envio });
  }

  async enviarMidia(envio: Envio<"midia">) {
    this.enviadas.push({ tipo: "midia", ...envio });
  }

  async enviarLocalizacao(envio: Envio<"localizacao">) {
    this.enviadas.push({ tipo: "localizacao", ...envio });
  }

  aoReceberMensagem(tratar: (mensagem: MensagemRecebida) => Promise<void>) {
    this.#tratadores.add(tratar);
    return () => {
      this.#tratadores.delete(tratar);
    };
  }

  /** Simula uma mensagem chegando (do cliente ou, com fromMe, do corretor). */
  async simularRecebimento(mensagem: MensagemRecebida) {
    for (const tratar of this.#tratadores) await tratar(mensagem);
  }
}
