import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  conversas,
  type Etapa,
  type Interesse,
  type Midia,
  mensagens,
} from "@/lib/db/schema";
import * as whatsapp from "@/lib/whatsapp";
import type { Session } from "../session";

// O que uma ferramenta (e o orquestrador) sabe sobre o atendimento em curso.
// Montado por `atenderMensagem` a partir da conversa; a sessão é a do corretor
// dono, então toda função de src/data chamada daqui já sai escopada.
export type ContextoDoAtendimento = {
  session: Extract<Session, { role: "corretor" }>;
  instancia: string;
  corretor: { nome: string };
  conversa: { id: string; telefone: string };
  negocio: {
    id: string;
    etapa: Etapa;
    interesse: Interesse | null;
    empreendimentoInteresseId: string | null;
    loteInteresseId: string | null;
  };
  // Ticket 10: `registrar_opt_out` liga isto para o assistente poder mandar
  // uma única despedida curta na mesma rodada; depois, nada mais sai.
  despedidaPendente?: boolean;
};

// Ticket 10: a conversa tem opt-out e o envio foi recusado.
export class OptOutError extends Error {
  override name = "OptOutError";
}

// Todo envio do assistente ao cliente passa por aqui: se o cliente pediu para
// não receber mais mensagens (opt-out), recusa, exceto a despedida liberada
// pela ferramenta `registrar_opt_out` na mesma rodada.
async function garantirQuePodeEnviar(
  contexto: ContextoDoAtendimento,
  opcoes: { despedida?: boolean } = {},
) {
  const [conversa] = await db
    .select({ optOut: conversas.optOut })
    .from(conversas)
    .where(eq(conversas.id, contexto.conversa.id));
  if (!conversa?.optOut) return;
  if (opcoes.despedida && contexto.despedidaPendente) {
    contexto.despedidaPendente = false;
    return;
  }
  throw new OptOutError(
    "O cliente pediu para não receber mais mensagens (opt-out).",
  );
}

export async function enviarTextoAoCliente(
  contexto: ContextoDoAtendimento,
  texto: string,
  opcoes: { despedida?: boolean } = {},
) {
  await garantirQuePodeEnviar(contexto, opcoes);
  return whatsapp.enviarTexto(
    contexto.instancia,
    contexto.conversa.telefone,
    texto,
  );
}

export async function enviarMidiaAoCliente(
  contexto: ContextoDoAtendimento,
  midia: Parameters<typeof whatsapp.enviarMidia>[2],
) {
  await garantirQuePodeEnviar(contexto);
  return whatsapp.enviarMidia(
    contexto.instancia,
    contexto.conversa.telefone,
    midia,
  );
}

// Toda mensagem que o assistente manda pelo WhatsApp fica na conversa com
// autor `assistente`. O id devolvido pela Evolution é a chave natural: quando
// o webhook ecoar a própria mensagem (fromMe), a unique (conversa, id) a
// descarta.
export async function gravarMensagemDoAssistente(
  contexto: ContextoDoAtendimento,
  input: { idMensagem: string; texto: string | null; midia?: Midia | null },
) {
  const agora = new Date();
  await db
    .insert(mensagens)
    .values({
      conversaId: contexto.conversa.id,
      evolutionId: input.idMensagem,
      autor: "assistente",
      texto: input.texto,
      midia: input.midia ?? null,
      fromMe: true,
      enviadaEm: agora,
      criadaEm: agora,
    })
    .onConflictDoNothing({
      target: [mensagens.conversaId, mensagens.evolutionId],
    });
}
