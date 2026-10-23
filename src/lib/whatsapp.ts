import { z } from "zod";
import { env } from "@/lib/env";

// Único módulo que conhece a Evolution API v2 (ADR-0004). O resto do sistema
// só vê estas funções e os tipos normalizados abaixo; em testes o módulo
// inteiro é trocado por src/test/fakes/whatsapp.ts.

export type EstadoDaInstancia = "open" | "close" | "connecting" | "refused";

export type QrCode = {
  estado: EstadoDaInstancia;
  // Imagem data:image/png;base64,...; ausente quando já conectado.
  base64?: string;
  pairingCode?: string;
};

export type MidiaRecebida = {
  tipo: "imagem" | "audio" | "video" | "documento" | "figurinha";
  mimetype: string | null;
  nomeDoArquivo: string | null;
  url: string | null;
};

// Mensagem do webhook já traduzida; é o que a DAL (`receberMensagem`) recebe.
export type MensagemRecebida = {
  instancia: string;
  idMensagem: string;
  remoteJid: string;
  // Só dígitos com DDI; null para @lid sem número conhecido.
  telefone: string | null;
  nomeDoContato: string | null;
  fromMe: boolean;
  grupo: boolean;
  texto: string | null;
  midia: MidiaRecebida | null;
  enviadaEm: Date;
};

export type EventoWebhook =
  | { tipo: "mensagem"; mensagem: MensagemRecebida }
  | { tipo: "conexao"; instancia: string; estado: EstadoDaInstancia }
  | { tipo: "ignorado" };

const headers = () => ({
  "Content-Type": "application/json",
  apikey: env.EVOLUTION_API_KEY,
});

async function evolution<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`${env.EVOLUTION_API_URL}${path}`, {
    method,
    headers: headers(),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(
      `Evolution ${method} ${path}: ${response.status} ${await response.text()}`,
    );
  }
  return (await response.json()) as T;
}

export function webhookUrl() {
  return `${env.APP_URL}/api/webhooks/evolution`;
}

// Cria a instância do corretor já apontando o webhook para o app. Grupos
// ignorados e sem histórico, como manda a spec. Idempotente: instância
// existente é reaproveitada.
export async function criarInstancia(instancia: string): Promise<void> {
  const existentes = await evolution<Array<{ name?: string }>>(
    "GET",
    `/instance/fetchInstances?instanceName=${encodeURIComponent(instancia)}`,
  ).catch(() => []);
  if (existentes.some((i) => i.name === instancia)) return;

  await evolution("POST", "/instance/create", {
    instanceName: instancia,
    integration: "WHATSAPP-BAILEYS",
    qrcode: true,
    groupsIgnore: true,
    syncFullHistory: false,
    readMessages: false,
    webhook: {
      enabled: true,
      url: webhookUrl(),
      byEvents: false,
      base64: false,
      events: ["CONNECTION_UPDATE", "MESSAGES_UPSERT"],
      headers: { "x-webhook-secret": env.EVOLUTION_WEBHOOK_SECRET },
    },
  });
}

// GET /instance/connect devolve o QR quando conectando e só o estado quando
// já conectado; os dois shapes são tratados aqui.
export async function obterQrCode(instancia: string): Promise<QrCode> {
  const data = await evolution<{
    base64?: string;
    pairingCode?: string;
    instance?: { state?: EstadoDaInstancia };
  }>("GET", `/instance/connect/${encodeURIComponent(instancia)}`);
  if (data.base64) {
    return {
      estado: "connecting",
      base64: data.base64,
      pairingCode: data.pairingCode,
    };
  }
  return { estado: data.instance?.state ?? "close" };
}

export async function estadoDaConexao(
  instancia: string,
): Promise<EstadoDaInstancia> {
  const data = await evolution<{ instance?: { state?: EstadoDaInstancia } }>(
    "GET",
    `/instance/connectionState/${encodeURIComponent(instancia)}`,
  );
  return data.instance?.state ?? "close";
}

export async function enviarTexto(
  instancia: string,
  para: string,
  texto: string,
): Promise<{ idMensagem: string }> {
  const data = await evolution<{ key: { id: string } }>(
    "POST",
    `/message/sendText/${encodeURIComponent(instancia)}`,
    { number: para, text: texto },
  );
  return { idMensagem: data.key.id };
}

// Mensagem do número de sistema (instância própria, ADR: chip separado) para
// o corretor: avisos de pendência. Sem EVOLUTION_SYSTEM_INSTANCE, lança.
export async function enviarTextoDoSistema(
  telefone: string,
  texto: string,
): Promise<{ idMensagem: string }> {
  const instancia = env.EVOLUTION_SYSTEM_INSTANCE;
  if (!instancia) {
    throw new Error("EVOLUTION_SYSTEM_INSTANCE não configurada");
  }
  return enviarTexto(instancia, telefone, texto);
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
): Promise<{ idMensagem: string }> {
  const data = await evolution<{ key: { id: string } }>(
    "POST",
    `/message/sendMedia/${encodeURIComponent(instancia)}`,
    {
      number: para,
      mediatype: midia.tipo,
      media: midia.url,
      mimetype: midia.mimetype,
      caption: midia.legenda,
      fileName: midia.nomeDoArquivo,
    },
  );
  return { idMensagem: data.key.id };
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
): Promise<{ idMensagem: string }> {
  const data = await evolution<{ key: { id: string } }>(
    "POST",
    `/message/sendLocation/${encodeURIComponent(instancia)}`,
    {
      number: para,
      latitude: local.latitude,
      longitude: local.longitude,
      name: local.nome,
      address: local.endereco,
    },
  );
  return { idMensagem: data.key.id };
}

// Baixa o conteúdo de uma mídia recebida (áudio, por enquanto) pelo id da
// mensagem na Evolution; a Evolution devolve base64 e o mimetype real.
export async function baixarMidia(
  instancia: string,
  idMensagem: string,
): Promise<{ bytes: Uint8Array; mimeType: string }> {
  const data = await evolution<{ base64: string; mimetype: string }>(
    "POST",
    `/chat/getBase64FromMediaMessage/${encodeURIComponent(instancia)}`,
    { message: { key: { id: idMensagem } }, convertToMp4: false },
  );
  return {
    bytes: new Uint8Array(Buffer.from(data.base64, "base64")),
    mimeType: data.mimetype,
  };
}

// --- Webhook -----------------------------------------------------------------

const estadoSchema = z.enum(["open", "close", "connecting", "refused"]);

const midiaSchema = z
  .object({ mimetype: z.string().optional(), caption: z.string().optional() })
  .loose();

const conteudoSchema = z
  .object({
    conversation: z.string().optional(),
    extendedTextMessage: z.object({ text: z.string() }).loose().optional(),
    imageMessage: midiaSchema.optional(),
    videoMessage: midiaSchema.optional(),
    audioMessage: midiaSchema.optional(),
    stickerMessage: midiaSchema.optional(),
    documentMessage: midiaSchema
      .extend({ fileName: z.string().optional() })
      .optional(),
    mediaUrl: z.string().optional(),
  })
  .loose();

const upsertSchema = z
  .object({
    key: z
      .object({
        remoteJid: z.string(),
        fromMe: z.boolean().default(false),
        id: z.string(),
        remoteJidAlt: z.string().optional(),
      })
      .loose(),
    pushName: z.string().optional(),
    message: z
      .object({
        ephemeralMessage: z.object({ message: conteudoSchema }).loose(),
      })
      .loose()
      .transform((m) => m.ephemeralMessage.message)
      .or(conteudoSchema)
      .optional(),
    messageTimestamp: z.coerce.number().optional(),
  })
  .loose();

const envelopeSchema = z
  .object({ event: z.string(), instance: z.string(), data: z.unknown() })
  .loose();

function telefoneDoJid(jid: string) {
  const [usuario] = jid.split("@");
  return usuario && /^\d{8,15}$/.test(usuario) ? usuario : null;
}

function midiaDe(m: z.infer<typeof conteudoSchema>): MidiaRecebida | null {
  const tipos = [
    ["imagem", m.imageMessage],
    ["video", m.videoMessage],
    ["audio", m.audioMessage],
    ["documento", m.documentMessage],
    ["figurinha", m.stickerMessage],
  ] as const;
  for (const [tipo, conteudo] of tipos) {
    if (conteudo) {
      return {
        tipo,
        mimetype: conteudo.mimetype ?? null,
        nomeDoArquivo:
          tipo === "documento" ? (m.documentMessage?.fileName ?? null) : null,
        url: m.mediaUrl ?? null,
      };
    }
  }
  return null;
}

// Traduz o envelope da Evolution no evento normalizado. Payloads que não
// interessam (ou malformados) viram `ignorado`, nunca erro.
export function parseWebhook(body: unknown): EventoWebhook {
  const envelope = envelopeSchema.safeParse(body);
  if (!envelope.success) return { tipo: "ignorado" };
  const { event, instance, data } = envelope.data;

  if (event === "connection.update") {
    const parsed = z.object({ state: estadoSchema }).loose().safeParse(data);
    if (!parsed.success) return { tipo: "ignorado" };
    return { tipo: "conexao", instancia: instance, estado: parsed.data.state };
  }

  if (event === "messages.upsert") {
    const parsed = upsertSchema.safeParse(data);
    if (!parsed.success) return { tipo: "ignorado" };
    const { key, pushName, message, messageTimestamp } = parsed.data;
    if (key.remoteJid.endsWith("@broadcast")) return { tipo: "ignorado" };

    const grupo = key.remoteJid.endsWith("@g.us");
    const jidDoNumero =
      key.remoteJid.endsWith("@lid") && key.remoteJidAlt
        ? key.remoteJidAlt
        : key.remoteJid;
    const texto =
      message?.conversation ??
      message?.extendedTextMessage?.text ??
      message?.imageMessage?.caption ??
      message?.videoMessage?.caption ??
      message?.documentMessage?.caption ??
      null;
    return {
      tipo: "mensagem",
      mensagem: {
        instancia: instance,
        idMensagem: key.id,
        remoteJid: key.remoteJid,
        telefone: grupo ? null : telefoneDoJid(jidDoNumero),
        nomeDoContato: pushName ?? null,
        fromMe: key.fromMe,
        grupo,
        texto,
        midia: message ? midiaDe(message) : null,
        enviadaEm: messageTimestamp
          ? new Date(messageTimestamp * 1000)
          : new Date(),
      },
    };
  }

  return { tipo: "ignorado" };
}
