// ADR-0004: nenhum outro módulo conhece a Evolution API; trocar para a
// Cloud API oficial deve exigir só uma nova implementação desta interface.

export type ConnectionState = "connected" | "connecting" | "disconnected";

export type MediaType = "image" | "video" | "audio" | "document";

export type IncomingMessage = {
  instance: string;
  /** Telefone do outro lado da conversa, em formato E.164 sem "+". */
  phone: string;
  /** true quando enviada pelo celular do próprio corretor. */
  fromMe: boolean;
  isGroup: boolean;
  receivedAt: Date;
  text?: string;
  media?: { type: MediaType; url: string; mimeType: string };
};

export type OutgoingMessage =
  | { kind: "text"; instance: string; phone: string; text: string }
  | {
      kind: "media";
      instance: string;
      phone: string;
      media: MediaType;
      url: string;
      caption?: string;
    }
  | {
      kind: "location";
      instance: string;
      phone: string;
      latitude: number;
      longitude: number;
      name?: string;
      address?: string;
    };

type WithoutKind<T> = T extends unknown ? Omit<T, "kind"> : never;
type Send<K extends OutgoingMessage["kind"]> = WithoutKind<
  Extract<OutgoingMessage, { kind: K }>
>;

export interface WhatsApp {
  /** Cria ou reconecta a instância e devolve o QR code a ser lido. */
  connect(instance: string): Promise<{ qrCode: string }>;
  connectionState(instance: string): Promise<ConnectionState>;
  sendText(message: Send<"text">): Promise<void>;
  sendMedia(message: Send<"media">): Promise<void>;
  sendLocation(message: Send<"location">): Promise<void>;
  /** Registra quem trata mensagens recebidas; devolve função para cancelar. */
  onMessage(handler: (message: IncomingMessage) => Promise<void>): () => void;
}

export class WhatsAppFake implements WhatsApp {
  readonly sent: OutgoingMessage[] = [];
  readonly states = new Map<string, ConnectionState>();
  #handlers = new Set<(message: IncomingMessage) => Promise<void>>();

  // Fica "connecting" até o teste definir outro estado em `states`,
  // como faria a leitura do QR code.
  async connect(instance: string) {
    this.states.set(instance, "connecting");
    return { qrCode: `fake-qr-code:${instance}` };
  }

  async connectionState(instance: string) {
    return this.states.get(instance) ?? "disconnected";
  }

  async sendText(message: Send<"text">) {
    this.sent.push({ kind: "text", ...message });
  }

  async sendMedia(message: Send<"media">) {
    this.sent.push({ kind: "media", ...message });
  }

  async sendLocation(message: Send<"location">) {
    this.sent.push({ kind: "location", ...message });
  }

  onMessage(handler: (message: IncomingMessage) => Promise<void>) {
    this.#handlers.add(handler);
    return () => {
      this.#handlers.delete(handler);
    };
  }

  /** Simula uma mensagem chegando (do cliente ou, com fromMe, do corretor). */
  async receive(message: IncomingMessage) {
    for (const handler of this.#handlers) await handler(message);
  }
}
