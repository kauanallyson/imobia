import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  clientes,
  conversas,
  mensagens,
  whatsappConexoes,
} from "@/lib/db/schema";
import * as llm from "@/lib/llm";
import type { MensagemRecebida } from "@/lib/whatsapp";
import * as whatsapp from "@/lib/whatsapp";
import { atenderMensagem } from "./assistente";
import { inserirNegocioEmNovo } from "./negocios";
import { requireCorretor, type Session } from "./session";

// Estado do assistente por conversa (ticket 10) vive em módulo próprio para
// as ferramentas do assistente importarem sem ciclo; a interface usa daqui.
export {
  buscarConversa,
  desligarAssistente,
  devolverAoAssistente,
  ligarAssistente,
  registrarOptOut,
  retomarAssistentesPausados,
} from "./estado-do-assistente";

const mensagemColumns = {
  id: mensagens.id,
  evolutionId: mensagens.evolutionId,
  autor: mensagens.autor,
  texto: mensagens.texto,
  midia: mensagens.midia,
  transcricao: mensagens.transcricao,
  fromMe: mensagens.fromMe,
  enviadaEm: mensagens.enviadaEm,
};

// Regra do "número novo" (spec, histórias 24, 25, 28): mensagem de um
// telefone sem conversa com o corretor cria cliente + negócio em Novo +
// conversa; número conhecido só acrescenta à conversa; grupos e mensagens
// `fromMe` para número desconhecido são ignorados (o corretor puxou a
// conversa, não é um cliente do anúncio). A reentrega do webhook é um no-op
// pela chave única (conversa, id da Evolution). Sem sessão: a Evolution é a
// origem; o corretor vem da instância.
//
// Depois de gravar uma mensagem nova do cliente, aciona o assistente (que
// decide sozinho se está ativo na conversa). Só a gravação nova aciona: a
// reentrega do webhook não gera segunda resposta. Falha do modelo não derruba
// o webhook: a mensagem já está guardada, o erro vai para o log.
export async function receberMensagem(mensagem: MensagemRecebida) {
  const gravacao = await gravarMensagemRecebida(mensagem);
  if (gravacao?.gravada && gravacao.mensagemId && !mensagem.fromMe) {
    if (mensagem.midia?.tipo === "audio") {
      // Ticket 19: sem transcrição não há o que atender; o cliente já foi
      // avisado por `transcreverAudioRecebido`.
      const transcrito = await transcreverAudioRecebido(
        mensagem,
        gravacao.mensagemId,
        gravacao.conversaId,
      );
      if (!transcrito) return gravacao;
    }
    try {
      await atenderMensagem(gravacao.conversaId);
    } catch (error) {
      console.error("assistente: falha ao atender a mensagem", error);
    }
  }
  return gravacao;
}

export const PEDIDO_PARA_ESCREVER =
  "Não consegui ouvir seu áudio. Pode escrever a mensagem ou enviar o áudio de novo, por favor?";

// Ticket 19: baixa e transcreve o áudio do cliente, guardando a transcrição na
// mensagem (o assistente lê `transcricao ?? texto`). Em falha, a mensagem fica
// sem transcrição e o cliente recebe um pedido fixo para escrever ou reenviar,
// gravado como mensagem do assistente. Só roda na primeira gravação da
// mensagem (a reentrega do webhook não chega aqui), então o pedido vai uma só
// vez. Nunca lança: falha vira log. Devolve se há transcrição.
async function transcreverAudioRecebido(
  mensagem: MensagemRecebida,
  mensagemId: string,
  conversaId: string,
): Promise<boolean> {
  try {
    const audio = await whatsapp.baixarMidia(
      mensagem.instancia,
      mensagem.idMensagem,
    );
    const transcricao = await llm.transcrever(audio);
    await db
      .update(mensagens)
      .set({ transcricao })
      .where(eq(mensagens.id, mensagemId));
    return true;
  } catch (error) {
    console.error("transcrição: falha ao transcrever o áudio", error);
  }

  try {
    const [conversa] = await db
      .select({ assistente: conversas.assistente })
      .from(conversas)
      .where(eq(conversas.id, conversaId));
    // Com o corretor no comando, quem responde ao áudio é ele.
    if (conversa?.assistente !== "ativo") return false;
    const { idMensagem } = await whatsapp.enviarTexto(
      mensagem.instancia,
      mensagem.telefone ?? "",
      PEDIDO_PARA_ESCREVER,
    );
    const agora = new Date();
    await db
      .insert(mensagens)
      .values({
        conversaId,
        evolutionId: idMensagem,
        autor: "assistente",
        texto: PEDIDO_PARA_ESCREVER,
        fromMe: true,
        enviadaEm: agora,
        criadaEm: agora,
      })
      .onConflictDoNothing({
        target: [mensagens.conversaId, mensagens.evolutionId],
      });
  } catch (error) {
    console.error("transcrição: falha ao pedir que o cliente escreva", error);
  }
  return false;
}

async function gravarMensagemRecebida(mensagem: MensagemRecebida) {
  if (mensagem.grupo || !mensagem.telefone) return null;
  const { telefone } = mensagem;

  const [conexao] = await db
    .select({
      corretorId: whatsappConexoes.corretorId,
      imobiliariaId: whatsappConexoes.imobiliariaId,
    })
    .from(whatsappConexoes)
    .where(eq(whatsappConexoes.instancia, mensagem.instancia));
  if (!conexao) return null;
  const { corretorId, imobiliariaId } = conexao;

  return db.transaction(async (tx) => {
    // Serializa webhooks simultâneos do mesmo número para este corretor.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`${corretorId}:${telefone}`}))`,
    );

    let [conversa] = await tx
      .select({ id: conversas.id, assistente: conversas.assistente })
      .from(conversas)
      .innerJoin(clientes, eq(clientes.id, conversas.clienteId))
      .where(
        and(
          eq(conversas.corretorId, corretorId),
          eq(clientes.telefone, telefone),
        ),
      );
    let novoCliente = false;

    if (!conversa) {
      if (mensagem.fromMe) return null;
      const agora = new Date();
      const [cliente] = await tx
        .insert(clientes)
        .values({
          imobiliariaId,
          corretorId,
          nome: mensagem.nomeDoContato ?? telefone,
          telefone,
          criadoEm: agora,
        })
        .returning({ id: clientes.id });
      if (!cliente) throw new Error("cliente não inserido");
      await inserirNegocioEmNovo(tx, {
        imobiliariaId,
        corretorId,
        clienteId: cliente.id,
      });
      [conversa] = await tx
        .insert(conversas)
        .values({
          imobiliariaId,
          corretorId,
          clienteId: cliente.id,
          criadaEm: agora,
        })
        .returning({ id: conversas.id, assistente: conversas.assistente });
      if (!conversa) throw new Error("conversa não inserida");
      novoCliente = true;
    }

    const [gravada] = await tx
      .insert(mensagens)
      .values({
        conversaId: conversa.id,
        evolutionId: mensagem.idMensagem,
        autor: mensagem.fromMe ? "corretor" : "cliente",
        texto: mensagem.texto,
        midia: mensagem.midia,
        fromMe: mensagem.fromMe,
        enviadaEm: mensagem.enviadaEm,
        criadaEm: new Date(),
      })
      .onConflictDoNothing({
        target: [mensagens.conversaId, mensagens.evolutionId],
      })
      .returning({ id: mensagens.id });

    // Pausa (spec → Assistente → Pausa, ticket 10): uma mensagem `fromMe`
    // gravada agora é do corretor pelo celular, e pausa o assistente ativo.
    // O eco das mensagens do próprio assistente também vem `fromMe`, mas ele
    // já foi gravado pelo id da Evolution ao enviar: cai no conflito acima
    // (`gravada` falso) e não chega aqui. Desligado continua desligado.
    if (gravada && mensagem.fromMe) {
      await tx
        .update(conversas)
        .set({
          ultimaMensagemCorretorEm: mensagem.enviadaEm,
          ...(conversa.assistente === "ativo"
            ? { assistente: "pausado" as const }
            : {}),
        })
        .where(eq(conversas.id, conversa.id));
    }

    return {
      conversaId: conversa.id,
      mensagemId: gravada?.id ?? null,
      novoCliente,
      gravada: Boolean(gravada),
    };
  });
}

export async function listarMensagens(session: Session, conversaId: string) {
  const { corretorId } = requireCorretor(session);
  if (!z.uuid().safeParse(conversaId).success) return [];
  return db
    .select(mensagemColumns)
    .from(mensagens)
    .innerJoin(conversas, eq(conversas.id, mensagens.conversaId))
    .where(
      and(eq(conversas.id, conversaId), eq(conversas.corretorId, corretorId)),
    )
    .orderBy(asc(mensagens.enviadaEm), asc(mensagens.criadaEm));
}
