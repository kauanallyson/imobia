import "server-only";
import { and, asc, desc, eq, notInArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  clientes,
  conversas,
  mensagens,
  negocios,
  users,
  whatsappConexoes,
} from "@/lib/db/schema";
import * as llm from "@/lib/llm";
import { contextoDoNegocio, enviarTextoAoCliente } from "./assistente/contexto";
import {
  descreverFerramentas,
  executarFerramenta,
} from "./assistente/ferramentas";
import { montarInstrucoes } from "./assistente/prompt";
import { listarEmpreendimentos } from "./empreendimentos";
import { mudarEtapa } from "./negocios";

// Quantas rodadas de ferramentas o modelo pode pedir antes de ser obrigado a
// responder em texto.
const MAXIMO_DE_RODADAS = 8;

export type ResultadoDoAtendimento =
  | { atendeu: true; texto: string }
  | {
      atendeu: false;
      motivo: "conversa_inexistente" | "assistente_inativo" | "sem_negocio";
    };

// O hub do assistente (spec → Assistente): chamado por `receberMensagem`
// depois que uma mensagem do cliente foi gravada pela primeira vez (a
// reentrega do webhook nunca chega aqui, então uma mensagem gera uma só
// resposta). Monta o histórico da conversa, roda o modelo até ele responder
// em texto (executando as ferramentas que pedir), envia o texto pelo
// WhatsApp do corretor e grava como mensagem do assistente. Sem sessão: a
// sessão é a do corretor dono da conversa.
export async function atenderMensagem(
  conversaId: string,
): Promise<ResultadoDoAtendimento> {
  const [conversa] = await db
    .select({
      id: conversas.id,
      assistente: conversas.assistente,
      optOut: conversas.optOut,
      corretorId: conversas.corretorId,
      imobiliariaId: conversas.imobiliariaId,
      clienteId: conversas.clienteId,
      telefone: clientes.telefone,
      corretorNome: users.name,
      instancia: whatsappConexoes.instancia,
    })
    .from(conversas)
    .innerJoin(clientes, eq(clientes.id, conversas.clienteId))
    .innerJoin(users, eq(users.id, conversas.corretorId))
    .innerJoin(
      whatsappConexoes,
      eq(whatsappConexoes.corretorId, conversas.corretorId),
    )
    .where(eq(conversas.id, conversaId));
  if (!conversa || !conversa.instancia) {
    return { atendeu: false, motivo: "conversa_inexistente" };
  }
  if (conversa.assistente !== "ativo" || conversa.optOut) {
    return { atendeu: false, motivo: "assistente_inativo" };
  }

  // O negócio aberto mais recente do cliente com este corretor.
  const [negocio] = await db
    .select({
      id: negocios.id,
      etapa: negocios.etapa,
      interesse: negocios.interesse,
      empreendimentoInteresseId: negocios.empreendimentoInteresseId,
      loteInteresseId: negocios.loteInteresseId,
    })
    .from(negocios)
    .where(
      and(
        eq(negocios.clienteId, conversa.clienteId),
        eq(negocios.corretorId, conversa.corretorId),
        notInArray(negocios.etapa, ["ganho", "perdido"]),
      ),
    )
    .orderBy(desc(negocios.criadoEm))
    .limit(1);
  if (!negocio) return { atendeu: false, motivo: "sem_negocio" };

  const contexto = await contextoDoNegocio(negocio.id);
  if (!contexto) return { atendeu: false, motivo: "conversa_inexistente" };

  const historico = await montarHistorico(conversa.id);
  const empreendimentos = await listarEmpreendimentos(contexto.session);
  const ferramentas = descreverFerramentas();

  let resposta = await llm.responder({
    instrucoes: montarInstrucoes(contexto, empreendimentos),
    historico,
    ferramentas,
  });
  for (let rodada = 0; resposta.tipo === "chamadas"; rodada++) {
    if (rodada >= MAXIMO_DE_RODADAS) {
      throw new Error("assistente: o modelo não parou de pedir ferramentas");
    }
    const resultados: llm.ResultadoDeFerramenta[] = [];
    for (const chamada of resposta.chamadas) {
      resultados.push({
        chamadaId: chamada.id,
        resultado: await executarFerramenta(contexto, chamada),
      });
    }
    resposta = await llm.responder({
      // O contexto pode ter mudado (interesse, empreendimento); as
      // instruções recalculadas valem na próxima conversa sem encadeamento.
      instrucoes: montarInstrucoes(contexto, empreendimentos),
      historico,
      ferramentas,
      respostaAnterior: { responseId: resposta.responseId, resultados },
    });
  }

  const texto = resposta.texto.trim();
  if (texto) {
    // Ticket 10: com opt-out registrado nesta rodada, este é o último envio.
    await enviarTextoAoCliente(contexto, texto, { despedida: true });
  }

  // História 45: o negócio vai para Em atendimento quando o assistente
  // começa a conversar.
  if (contexto.negocio.etapa === "novo") {
    await mudarEtapa(contexto.session, contexto.negocio.id, "em_atendimento", {
      autor: "assistente",
    });
  }

  return { atendeu: true, texto };
}

// A conversa como o modelo a vê: cliente → usuário; assistente e corretor →
// assistente (a fala do corretor é identificada no texto). Mídia sem texto
// vira uma marcação; a transcrição de áudio (ticket 19) entra no lugar.
export async function montarHistorico(
  conversaId: string,
): Promise<llm.MensagemDoModelo[]> {
  const lista = await db
    .select({
      autor: mensagens.autor,
      texto: mensagens.texto,
      midia: mensagens.midia,
      transcricao: mensagens.transcricao,
    })
    .from(mensagens)
    .where(eq(mensagens.conversaId, conversaId))
    .orderBy(asc(mensagens.enviadaEm), asc(mensagens.criadaEm));

  return lista.map((m) => {
    const corpo =
      m.transcricao ??
      m.texto ??
      (m.midia
        ? `[${m.midia.tipo}${m.midia.nomeDoArquivo ? `: ${m.midia.nomeDoArquivo}` : ""}]`
        : "");
    return m.autor === "cliente"
      ? { papel: "usuario", texto: corpo }
      : {
          papel: "assistente",
          texto: m.autor === "corretor" ? `[corretor] ${corpo}` : corpo,
        };
  });
}
