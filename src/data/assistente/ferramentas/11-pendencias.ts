import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { conversas } from "@/lib/db/schema";
import { criarPendencia } from "../../pendencias";
import type { ContextoDoAtendimento } from "../contexto";
import type { Ferramenta } from "../ferramentas";

// Ferramentas de pendência (ticket 11): o assistente passa ao corretor o que
// não resolve sozinho.

const ferramentaPerguntaSemResposta: Ferramenta<
  z.ZodObject<{ pergunta: z.ZodString }>
> = {
  nome: "criar_pendencia_pergunta_sem_resposta",
  descricao:
    "Registra para o(a) corretor(a) uma pergunta do cliente que a base de conhecimento não respondeu. Chame quando buscar_base_de_conhecimento não devolver nada útil, e diga ao cliente que vai verificar e retorna.",
  parametros: z.object({
    pergunta: z
      .string()
      .min(1)
      .describe("A pergunta do cliente, em uma frase, como ele perguntou."),
  }),
  async executar(contexto, { pergunta }) {
    const pendencia = await criarPendencia(contexto.session, {
      negocioId: contexto.negocio.id,
      tipo: "pergunta_sem_resposta",
      descricao: pergunta,
    });
    if (!pendencia) return { erro: "Negócio não encontrado." };
    return { pendenciaId: pendencia.id, tipo: pendencia.tipo };
  },
};

const ferramentaChamarCorretor: Ferramenta<
  z.ZodObject<{ motivo: z.ZodString }>
> = {
  nome: "chamar_corretor",
  descricao:
    "Chame quando o cliente pedir para falar com uma pessoa (ou com o(a) corretor(a)), ou quando a conversa exigir alguém de verdade. Cria uma pendência urgente, avisa o(a) corretor(a) na hora e pausa você nesta conversa: depois de chamar, só diga ao cliente que o(a) corretor(a) vai falar com ele.",
  parametros: z.object({
    motivo: z
      .string()
      .min(1)
      .describe("Por que o cliente quer uma pessoa, em uma frase."),
  }),
  async executar(contexto, { motivo }) {
    const pendencia = await criarPendencia(contexto.session, {
      negocioId: contexto.negocio.id,
      tipo: "cliente_pediu_pessoa",
      descricao: motivo,
    });
    if (!pendencia) return { erro: "Negócio não encontrado." };
    await pausarConversa(contexto);
    return { pendenciaId: pendencia.id, tipo: pendencia.tipo, pausado: true };
  },
};

// "Levar a pausado": o corretor retoma pela interface (ticket 10). A resposta
// desta rodada ainda sai (é a despedida); a próxima mensagem do cliente não
// aciona o assistente.
async function pausarConversa(contexto: ContextoDoAtendimento) {
  await db
    .update(conversas)
    .set({ assistente: "pausado", pausadoEm: new Date() })
    .where(eq(conversas.id, contexto.conversa.id));
}

export const ferramentasDePendencias: Ferramenta[] = [
  ferramentaPerguntaSemResposta,
  ferramentaChamarCorretor,
];

// Seção das instruções do assistente sobre pendências.
export const secaoDePendencias = [
  "## Pendências (o que você passa ao corretor)",
  "- Quando buscar_base_de_conhecimento não devolver nenhum trecho que responda, chame criar_pendencia_pergunta_sem_resposta com a pergunta do cliente e diga que vai verificar com o(a) corretor(a) e retorna.",
  "- Quando o cliente pedir para falar com uma pessoa ou com o(a) corretor(a), chame chamar_corretor, diga que o(a) corretor(a) vai falar com ele e encerre sua participação.",
  "",
];
