// ADR-0004: nenhum outro módulo conhece a Evolution API; trocar para a
// Cloud API oficial deve exigir só novas implementações destas portas.

export type ConnectionState = "connected" | "connecting" | "disconnected";

export type MediaType = "image" | "video" | "audio" | "document";

/** Mensagem recebida, já traduzida do webhook pelo adaptador. */
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
export type Send<K extends OutgoingMessage["kind"]> = WithoutKind<
  Extract<OutgoingMessage, { kind: K }>
>;

export interface WhatsAppConnection {
  /** Cria ou reconecta a instância e devolve o QR code a ser lido. */
  connect(instance: string): Promise<{ qrCode: string }>;
  connectionState(instance: string): Promise<ConnectionState>;
}

export interface WhatsAppMessenger {
  sendText(message: Send<"text">): Promise<void>;
  sendMedia(message: Send<"media">): Promise<void>;
  sendLocation(message: Send<"location">): Promise<void>;
}
