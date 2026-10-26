import "server-only";
import { and, desc, eq, lte, max, ne, notInArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  clientes,
  conversas,
  type Etapa,
  followUps,
  mensagens,
  negocios,
  users,
  whatsappConexoes,
} from "@/lib/db/schema";
import { env } from "@/lib/env";
import * as llm from "@/lib/llm";
import * as whatsapp from "@/lib/whatsapp";
import { montarHistorico } from "./assistente";
import { contextoDoNegocio, enviarTextoAoCliente } from "./assistente/contexto";
import {
  followUpDevido,
  naJanelaDeEnvio,
  type PassoDoFollowUp,
  SILENCIO_MAXIMO_DIAS,
} from "./cadencia";
import { requireCorretor, type Session } from "./session";

// Follow-up automático (spec → Follow-up; ticket 15). O job do worker, a cada
// minuto, olha cada conversa cujo negócio aberto mais recente está em
// atendimento e, se um passo da cadência venceu (src/data/cadencia.ts), manda
// ao cliente uma mensagem escrita pelo assistente a partir da conversa. Com a
// conversa pausada pelo corretor, quem recebe o passo é o corretor, num
// lembrete pelo número de sistema. Nenhum negócio muda de etapa aqui.

// Etapas "durante o atendimento". Novo fica de fora: o assistente ainda não
// conversou (desligado ou cadastro manual). Das etapas finais em diante os
// lembretes são outros (tickets 16/18).
export const etapasComFollowUp: readonly Etapa[] = [
  "em_atendimento",
  "visita_agendada",
];

// Última mensagem do cliente por conversa: o marco da contagem.
const ultimaDoCliente = db
  .select({
    conversaId: mensagens.conversaId,
    em: max(mensagens.enviadaEm).as("ultima_do_cliente_em"),
  })
  .from(mensagens)
  .where(eq(mensagens.autor, "cliente"))
  .groupBy(mensagens.conversaId)
  .as("ultima_do_cliente");

type Candidato = Awaited<ReturnType<typeof listarCandidatos>>[number];

async function listarCandidatos() {
  const linhas = await db
    .select({
      negocioId: negocios.id,
      etapa: negocios.etapa,
      interesse: negocios.interesse,
      empreendimentoInteresseId: negocios.empreendimentoInteresseId,
      loteInteresseId: negocios.loteInteresseId,
      criadoEm: negocios.criadoEm,
      corretorId: negocios.corretorId,
      imobiliariaId: negocios.imobiliariaId,
      conversaId: conversas.id,
      assistente: conversas.assistente,
      clienteNome: clientes.nome,
      telefone: clientes.telefone,
      corretorNome: users.name,
      telefoneDoCorretor: users.telefone,
      instancia: whatsappConexoes.instancia,
      ultimaMensagemDoClienteEm: ultimaDoCliente.em,
    })
    .from(negocios)
    .innerJoin(
      conversas,
      and(
        eq(conversas.clienteId, negocios.clienteId),
        eq(conversas.corretorId, negocios.corretorId),
      ),
    )
    .innerJoin(ultimaDoCliente, eq(ultimaDoCliente.conversaId, conversas.id))
    .innerJoin(clientes, eq(clientes.id, negocios.clienteId))
    .innerJoin(users, eq(users.id, negocios.corretorId))
    .leftJoin(
      whatsappConexoes,
      eq(whatsappConexoes.corretorId, negocios.corretorId),
    )
    .where(
      and(
        notInArray(negocios.etapa, ["ganho", "perdido"]),
        eq(conversas.optOut, false),
        ne(conversas.assistente, "desligado"),
        eq(users.ativo, true),
      ),
    )
    .orderBy(desc(negocios.criadoEm));

  // Uma conversa, um follow-up: vale o negócio aberto mais recente (o mesmo
  // que o assistente atende), e só se ele está em atendimento.
  const porConversa = new Map<string, (typeof linhas)[number]>();
  for (const linha of linhas) {
    if (!porConversa.has(linha.conversaId)) {
      porConversa.set(linha.conversaId, linha);
    }
  }
  return [...porConversa.values()].flatMap((linha) =>
    linha.ultimaMensagemDoClienteEm && etapasComFollowUp.includes(linha.etapa)
      ? [
          {
            ...linha,
            ultimaMensagemDoClienteEm: linha.ultimaMensagemDoClienteEm,
          },
        ]
      : [],
  );
}

// Job do worker. Fora da janela de envio não faz nada. Devolve quantos
// follow-ups saíram para clientes e quantos lembretes para corretores.
export async function enviarFollowUps(): Promise<{
  clientes: number;
  corretores: number;
}> {
  const resultado = { clientes: 0, corretores: 0 };
  const agora = new Date();
  if (!naJanelaDeEnvio(agora)) return resultado;

  for (const candidato of await listarCandidatos()) {
    const [enviado] = await db
      .select({ sequencia: max(followUps.sequencia) })
      .from(followUps)
      .where(
        and(
          eq(followUps.negocioId, candidato.negocioId),
          eq(
            followUps.ultimaMensagemDoClienteEm,
            candidato.ultimaMensagemDoClienteEm,
          ),
        ),
      );
    const passo = followUpDevido(
      candidato.ultimaMensagemDoClienteEm,
      enviado?.sequencia ?? 0,
      agora,
    );
    if (!passo) continue;

    if (candidato.assistente === "pausado") {
      if (await lembrarCorretor(candidato, passo, agora)) {
        resultado.corretores++;
      }
    } else if (await enviarAoCliente(candidato, passo, agora)) {
      resultado.clientes++;
    }
  }
  return resultado;
}

export const jobDeFollowUps = {
  nome: "follow-ups",
  executar: enviarFollowUps,
};

// Reivindica o passo pela chave natural antes de enviar: duas rodadas
// simultâneas não mandam duas vezes. Falha no envio libera o passo para a
// próxima rodada.
async function comPassoReivindicado(
  candidato: Candidato,
  passo: PassoDoFollowUp,
  destino: "cliente" | "corretor",
  agora: Date,
  enviar: () => Promise<void>,
): Promise<boolean> {
  const [reivindicado] = await db
    .insert(followUps)
    .values({
      negocioId: candidato.negocioId,
      ultimaMensagemDoClienteEm: candidato.ultimaMensagemDoClienteEm,
      sequencia: passo.sequencia,
      destino,
      devidoEm: passo.devidoEm,
      enviadoEm: agora,
    })
    .onConflictDoNothing()
    .returning({ id: followUps.id });
  if (!reivindicado) return false;
  try {
    await enviar();
    return true;
  } catch (error) {
    console.error("follow-up: falha ao enviar", error);
    await db.delete(followUps).where(eq(followUps.id, reivindicado.id));
    return false;
  }
}

const diasDeSilencio = (desde: Date, agora: Date) =>
  Math.max(1, Math.floor((agora.getTime() - desde.getTime()) / 86_400_000));

async function enviarAoCliente(
  candidato: Candidato,
  passo: PassoDoFollowUp,
  agora: Date,
) {
  const { instancia } = candidato;
  if (!instancia) return false;
  const contexto = await contextoDoNegocio(candidato.negocioId);
  if (!contexto) return false;
  return comPassoReivindicado(candidato, passo, "cliente", agora, async () => {
    const resposta = await llm.responder({
      instrucoes: instrucoesDoFollowUp(
        candidato.corretorNome,
        diasDeSilencio(candidato.ultimaMensagemDoClienteEm, agora),
      ),
      historico: await montarHistorico(candidato.conversaId),
      ferramentas: [],
    });
    const texto = resposta.tipo === "texto" ? resposta.texto.trim() : "";
    if (!texto) throw new Error("follow-up: o modelo não escreveu a mensagem");
    await enviarTextoAoCliente(contexto, texto);
  });
}

function instrucoesDoFollowUp(corretorNome: string, dias: number) {
  return [
    `Você é o assistente virtual do(a) corretor(a) de imóveis ${corretorNome} e atende clientes pelo WhatsApp em nome dele(a).`,
    `O cliente não responde há ${dias} dia(s). Escreva uma única mensagem curta de follow-up para retomar o contato.`,
    "- Retome o assunto da conversa (empreendimento, lote, visita, dúvida pendente); nada de mensagem genérica.",
    "- Termine com uma pergunta simples que convide o cliente a responder.",
    "- Fale em português do Brasil, tom cordial de WhatsApp, sem markdown.",
    "- Não invente informação, valor ou prazo; não negocie preço nem ofereça desconto.",
    "- Não repita follow-ups anteriores da conversa com as mesmas palavras.",
  ].join("\n");
}

async function lembrarCorretor(
  candidato: Candidato,
  passo: PassoDoFollowUp,
  agora: Date,
) {
  const telefone = candidato.telefoneDoCorretor;
  if (!telefone) return false;
  const dias = diasDeSilencio(candidato.ultimaMensagemDoClienteEm, agora);
  const texto = [
    "loteAI · Follow-up",
    `${candidato.clienteNome} não responde há ${dias} dia(s). A conversa está com você (assistente pausado), então o follow-up não foi enviado: que tal retomar o contato?`,
    `Abrir: ${env.APP_URL}/painel/negocios/${candidato.negocioId}`,
  ].join("\n");
  return comPassoReivindicado(candidato, passo, "corretor", agora, async () => {
    await whatsapp.enviarTextoDoSistema(telefone, texto);
  });
}

// Filtro de silenciosos no funil: negócios abertos do corretor cujo cliente
// não escreve há 90 dias ou mais (derivado, nada é gravado).
export async function listarNegociosSilenciosos(session: Session) {
  const { corretorId } = requireCorretor(session);
  // Silencioso quando a última mensagem do cliente é anterior a este limite.
  const limite = new Date(Date.now() - SILENCIO_MAXIMO_DIAS * 86_400_000);
  return db
    .select({
      id: negocios.id,
      etapa: negocios.etapa,
      clienteNome: clientes.nome,
      clienteTelefone: clientes.telefone,
      atualizadoEm: negocios.atualizadoEm,
      ultimaMensagemDoClienteEm: ultimaDoCliente.em,
    })
    .from(negocios)
    .innerJoin(clientes, eq(clientes.id, negocios.clienteId))
    .innerJoin(
      conversas,
      and(
        eq(conversas.clienteId, negocios.clienteId),
        eq(conversas.corretorId, negocios.corretorId),
      ),
    )
    .innerJoin(ultimaDoCliente, eq(ultimaDoCliente.conversaId, conversas.id))
    .where(
      and(
        eq(negocios.corretorId, corretorId),
        notInArray(negocios.etapa, ["ganho", "perdido"]),
        lte(ultimaDoCliente.em, limite),
      ),
    )
    .orderBy(ultimaDoCliente.em);
}

export type NegocioSilencioso = Awaited<
  ReturnType<typeof listarNegociosSilenciosos>
>[number];
