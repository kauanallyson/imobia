import type {
  EstadoDaInstancia,
  EventoWebhook,
  MensagemRecebida,
  MidiaRecebida,
  QrCode,
} from "@/lib/whatsapp";
// `parseWebhook` é puro: o falso reaproveita o real.
import {
  parseWebhook as parseWebhookReal,
  textoDaLocalizacao,
} from "@/lib/whatsapp";

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

// Números com conversa anterior "na Evolution" (antes do loteAI) e as
// consultas feitas; `falhas.historico` simula a Evolution fora do ar.
const comHistorico = new Set<string>();
export const consultasDeHistorico: Array<{
  instancia: string;
  remoteJid: string;
}> = [];
export const falhas = { historico: false };

let contador = 0;
const proximoId = () => `FAKE-${++contador}`;

export function limpar() {
  enviados.length = 0;
  eco = null;
  avisosDoSistema.length = 0;
  instancias.clear();
  midias.clear();
  downloads.length = 0;
  comHistorico.clear();
  consultasDeHistorico.length = 0;
  falhas.historico = false;
  contador = 0;
}

export function simularHistorico(telefone: string) {
  comHistorico.add(telefone);
}

export async function temHistoricoAnterior(
  instancia: string,
  remoteJid: string,
  _idMensagem: string,
) {
  consultasDeHistorico.push({ instancia, remoteJid });
  if (falhas.historico) throw new Error("whatsapp falso: Evolution fora do ar");
  return comHistorico.has(remoteJid.split("@")[0] ?? "");
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

// Simula o eco `fromMe` que a Evolution manda pelo webhook para cada envio,
// entregue ANTES de o envio devolver o id (o pior caso da corrida). O eco é
// montado no formato da Evolution e traduzido pelo `parseWebhook` real.
let eco: ((mensagem: MensagemRecebida) => Promise<unknown>) | null = null;
export function aoEnviarEcoar(
  receber: ((mensagem: MensagemRecebida) => Promise<unknown>) | null,
) {
  eco = receber;
}

async function ecoar(
  instancia: string,
  para: string,
  idMensagem: string,
  message: Record<string, unknown>,
) {
  if (!eco) return;
  const evento = parseWebhookReal({
    event: "messages.upsert",
    instance: instancia,
    data: {
      key: {
        remoteJid: `${para}@s.whatsapp.net`,
        fromMe: true,
        id: idMensagem,
      },
      message,
      messageTimestamp: Math.floor(Date.now() / 1000),
    },
  });
  if (evento.tipo === "mensagem") await eco(evento.mensagem);
}

export async function enviarTexto(
  instancia: string,
  para: string,
  texto: string,
) {
  enviados.push({ instancia, para, tipo: "texto", texto });
  const idMensagem = proximoId();
  await ecoar(instancia, para, idMensagem, { conversation: texto });
  return { idMensagem };
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
  midia: {
    tipo: "image" | "document" | "video" | "audio";
    url: string;
    mimetype?: string;
    legenda?: string;
    nomeDoArquivo?: string;
  },
) {
  enviados.push({ instancia, para, tipo: "midia", url: midia.url });
  const idMensagem = proximoId();
  const conteudo = { mimetype: midia.mimetype, caption: midia.legenda };
  await ecoar(instancia, para, idMensagem, {
    [`${midia.tipo}Message`]:
      midia.tipo === "document"
        ? { ...conteudo, fileName: midia.nomeDoArquivo }
        : conteudo,
  });
  return { idMensagem };
}

export async function enviarLocalizacao(
  instancia: string,
  para: string,
  local: {
    latitude: number;
    longitude: number;
    nome?: string;
    endereco?: string;
  },
) {
  enviados.push({
    instancia,
    para,
    tipo: "localizacao",
    latitude: local.latitude,
    longitude: local.longitude,
  });
  const idMensagem = proximoId();
  await ecoar(instancia, para, idMensagem, {
    locationMessage: {
      degreesLatitude: local.latitude,
      degreesLongitude: local.longitude,
      name: local.nome,
      address: local.endereco,
    },
  });
  return { idMensagem };
}

export const parseWebhook = parseWebhookReal;
export { textoDaLocalizacao };
