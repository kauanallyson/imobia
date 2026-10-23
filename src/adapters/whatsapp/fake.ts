import type {
  ConnectionState,
  OutgoingMessage,
  Send,
  WhatsAppConnection,
  WhatsAppMessenger,
} from "@/domain/ports/whatsapp";

export class WhatsAppFake implements WhatsAppConnection, WhatsAppMessenger {
  readonly sent: OutgoingMessage[] = [];
  readonly states = new Map<string, ConnectionState>();

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
}
