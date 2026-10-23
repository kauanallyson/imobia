import type { NextRequest } from "next/server";
import { receberMensagem } from "@/data/conversas";
import { atualizarEstadoDaConexao } from "@/data/whatsapp";
import { env } from "@/lib/env";
import { parseWebhook } from "@/lib/whatsapp";

// Webhook da Evolution API (único Route Handler além do OAuth do Google,
// como prevê a spec). Não há sessão de usuário: a Evolution se identifica
// pelo segredo enviado no header configurado na criação da instância, e o
// corretor dono vem da instância do envelope. A resposta é 200 rápida e a
// reentrega é um no-op pela chave única no banco.
export async function POST(request: NextRequest) {
  const secret =
    request.headers.get("x-webhook-secret") ??
    request.nextUrl.searchParams.get("secret");
  if (secret !== env.EVOLUTION_WEBHOOK_SECRET) {
    return Response.json({ erro: "não autorizado" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const evento = parseWebhook(body);

  if (evento.tipo === "conexao") {
    await atualizarEstadoDaConexao(evento.instancia, evento.estado);
  } else if (evento.tipo === "mensagem") {
    await receberMensagem(evento.mensagem);
  }

  return Response.json({ ok: true });
}
