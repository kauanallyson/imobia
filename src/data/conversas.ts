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
import type { MensagemRecebida } from "@/lib/whatsapp";
import { atenderMensagem } from "./assistente";
import { inserirNegocioEmNovo } from "./negocios";
import { requireCorretor, type Session } from "./session";

const mensagemColumns = {
  id: mensagens.id,
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
  if (gravacao?.gravada && !mensagem.fromMe) {
    try {
      await atenderMensagem(gravacao.conversaId);
    } catch (error) {
      console.error("assistente: falha ao atender a mensagem", error);
    }
  }
  return gravacao;
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
      .select({ id: conversas.id })
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
        .returning({ id: conversas.id });
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

    if (gravada && mensagem.fromMe) {
      await tx
        .update(conversas)
        .set({ ultimaMensagemCorretorEm: mensagem.enviadaEm })
        .where(eq(conversas.id, conversa.id));
    }

    return { conversaId: conversa.id, novoCliente, gravada: Boolean(gravada) };
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
