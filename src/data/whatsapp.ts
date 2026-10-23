import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { type EstadoDaConexao, whatsappConexoes } from "@/lib/db/schema";
import * as whatsapp from "@/lib/whatsapp";
import { ForbiddenError, type Session } from "./session";

const columns = {
  aceiteEm: whatsappConexoes.aceiteEm,
  instancia: whatsappConexoes.instancia,
  estado: whatsappConexoes.estado,
};

function requireCorretor(session: Session) {
  if (session.role !== "corretor") {
    throw new ForbiddenError("Somente um corretor conecta o WhatsApp");
  }
  return session;
}

// Registra o aceite do aviso de risco (ADR-0004). Um registro por corretor:
// aceitar de novo devolve o aceite original.
export async function aceitarRiscoDoWhatsapp(session: Session) {
  const { corretorId, imobiliariaId } = requireCorretor(session);
  const [created] = await db
    .insert(whatsappConexoes)
    .values({ corretorId, imobiliariaId, aceiteEm: new Date() })
    .onConflictDoNothing({ target: whatsappConexoes.corretorId })
    .returning(columns);
  if (created) return created;
  const existing = await buscarConexaoDoWhatsapp(session);
  if (!existing) throw new Error("aceite não encontrado após o conflito");
  return existing;
}

// null enquanto o corretor não aceitou o aviso.
export async function buscarConexaoDoWhatsapp(session: Session) {
  const { corretorId } = requireCorretor(session);
  const [found] = await db
    .select(columns)
    .from(whatsappConexoes)
    .where(eq(whatsappConexoes.corretorId, corretorId));
  return found ?? null;
}

const estadoDaInstancia: Record<whatsapp.EstadoDaInstancia, EstadoDaConexao> = {
  open: "conectado",
  connecting: "conectando",
  close: "desconectado",
  refused: "desconectado",
};

// Cria a instância na Evolution (se ainda não existe) e pede o QR code.
// Serve tanto para a primeira conexão quanto para reconectar. Sem aceite,
// nada acontece: null.
export async function gerarQrCode(session: Session) {
  const { corretorId } = requireCorretor(session);
  const conexao = await buscarConexaoDoWhatsapp(session);
  if (!conexao) return null;

  const instancia = conexao.instancia ?? `corretor-${corretorId}`;
  await whatsapp.criarInstancia(instancia);
  const qr = await whatsapp.obterQrCode(instancia);
  const estado = estadoDaInstancia[qr.estado];
  await db
    .update(whatsappConexoes)
    .set({ instancia, estado, atualizadaEm: new Date() })
    .where(eq(whatsappConexoes.corretorId, corretorId));
  return { instancia, estado, base64: qr.base64, pairingCode: qr.pairingCode };
}

// Chamado pelo webhook (connection.update); sem sessão porque vem da
// Evolution. Instância desconhecida → null.
export async function atualizarEstadoDaConexao(
  instancia: string,
  estado: whatsapp.EstadoDaInstancia,
) {
  const [updated] = await db
    .update(whatsappConexoes)
    .set({ estado: estadoDaInstancia[estado], atualizadaEm: new Date() })
    .where(eq(whatsappConexoes.instancia, instancia))
    .returning({ corretorId: whatsappConexoes.corretorId });
  return updated ?? null;
}
