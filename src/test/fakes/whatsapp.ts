import type {
  EstadoDaInstancia,
  EventoWebhook,
  MensagemRecebida,
  MidiaRecebida,
  QrCode,
} from "@/lib/whatsapp";
// `parseWebhook` é puro: o falso reaproveita o real.
import { parseWebhook as parseWebhookReal } from "@/lib/whatsapp";

// Falso em memória de src/lib/whatsapp.ts: mesma superfície, mais helpers de
// inspeção. Trocado pelo preload (src/test/fakes/preload.ts).

export type Envio =
  | { instancia: string; para: string; tipo: "texto"; texto: string }
  | { instancia: string; para: string; tipo: "midia"; url: string }
  | {
      instancia: string;
      para: string;
      tipo: "localizacao";
      latitude: number;
      longitude: number;
    };

export const enviados: Envio[] = [];
export const instancias = new Map<string, EstadoDaInstancia>();
// Mídias "na Evolution", por id da mensagem, e os downloads pedidos.
const midias = new Map<string, { bytes: Uint8Array; mimeType: string }>();
export const downloads: Array<{ instancia: string; idMensagem: string }> = [];

let contador = 0;
const proximoId = () => `FAKE-${++contador}`;

export function limpar() {
  enviados.length = 0;
  avisosDoSistema.length = 0;
  instancias.clear();
  midias.clear();
  downloads.length = 0;
  contador = 0;
}

// Roteiriza o conteúdo que `baixarMidia` devolve para uma mensagem.
export function simularMidia(
  idMensagem: string,
  midia: { bytes: Uint8Array; mimeType: string },
) {
  midias.set(idMensagem, midia);
}

export async function baixarMidia(instancia: string, idMensagem: string) {
  downloads.push({ instancia, idMensagem });
  const midia = midias.get(idMensagem);
  if (!midia) throw new Error(`whatsapp falso: sem mídia para ${idMensagem}`);
  return { ...midia };
}

// Simula o pareamento (o que a Evolution faria após o celular ler o QR).
export function simularEstado(instancia: string, estado: EstadoDaInstancia) {
  instancias.set(instancia, estado);
}

// Monta a mensagem normalizada que o webhook entregaria à DAL.
export function mensagemRecebida(
  input: Partial<MensagemRecebida> & { instancia: string; telefone: string },
): MensagemRecebida {
  const id = input.idMensagem ?? proximoId();
  return {
    idMensagem: id,
    remoteJid: input.grupo
      ? `${input.telefone}-123@g.us`
      : `${input.telefone}@s.whatsapp.net`,
    nomeDoContato: null,
    fromMe: false,
    grupo: false,
    texto: "Olá",
    midia: null,
    enviadaEm: new Date(),
    ...input,
  };
}

export type { MensagemRecebida, MidiaRecebida, EventoWebhook, QrCode };

export function webhookUrl() {
  return "http://localhost:3000/api/webhooks/evolution";
}

export async function criarInstancia(instancia: string): Promise<void> {
  if (!instancias.has(instancia)) instancias.set(instancia, "close");
}

export async function obterQrCode(instancia: string): Promise<QrCode> {
  const estado = instancias.get(instancia) ?? "close";
  if (estado === "open") return { estado };
  instancias.set(instancia, "connecting");
  return {
    estado: "connecting",
    base64: `data:image/png;base64,QR-${instancia}`,
    pairingCode: "ABCD-1234",
  };
}

export async function estadoDaConexao(
  instancia: string,
): Promise<EstadoDaInstancia> {
  return instancias.get(instancia) ?? "close";
}

export async function enviarTexto(
  instancia: string,
  para: string,
  texto: string,
) {
  enviados.push({ instancia, para, tipo: "texto", texto });
  return { idMensagem: proximoId() };
}

// Avisos do número de sistema, separados dos envios dos corretores.
export const avisosDoSistema: Array<{ para: string; texto: string }> = [];

export async function enviarTextoDoSistema(telefone: string, texto: string) {
  avisosDoSistema.push({ para: telefone, texto });
  return { idMensagem: proximoId() };
}

export async function enviarMidia(
  instancia: string,
  para: string,
  midia: { url: string },
) {
  enviados.push({ instancia, para, tipo: "midia", url: midia.url });
  return { idMensagem: proximoId() };
}

export async function enviarLocalizacao(
  instancia: string,
  para: string,
  local: { latitude: number; longitude: number },
) {
  enviados.push({ instancia, para, tipo: "localizacao", ...local });
  return { idMensagem: proximoId() };
}

export const parseWebhook = parseWebhookReal;
