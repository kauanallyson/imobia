import "server-only";
import { db } from "@/lib/db";
import {
  type Etapa,
  type Interesse,
  type Midia,
  mensagens,
} from "@/lib/db/schema";
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
};

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
