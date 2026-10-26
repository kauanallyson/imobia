import "server-only";
import { and, asc, eq, gte, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  clientes,
  conversas,
  type Etapa,
  type Interesse,
  type Midia,
  mensagens,
  negocios,
  users,
  whatsappConexoes,
} from "@/lib/db/schema";
import type { MensagemRecebida } from "@/lib/whatsapp";
import * as whatsapp from "@/lib/whatsapp";
import { isUniqueViolation } from "../errors";
import { type SessaoDoCorretor, sessaoDoCorretor } from "../session";

// O que uma ferramenta (e o orquestrador) sabe sobre o atendimento em curso.
// Montado só por `contextoDoNegocio`; a sessão é a do corretor dono, então
// toda função de src/data chamada daqui já sai escopada.
export type ContextoDoAtendimento = {
  session: SessaoDoCorretor;
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

// O contexto de um negócio: a conversa do cliente com o número do corretor.
// Sem conversa ou sem WhatsApp pareado → null (não há por onde falar).
export async function contextoDoNegocio(
  negocioId: string,
): Promise<ContextoDoAtendimento | null> {
  const [row] = await db
    .select({
      id: negocios.id,
      etapa: negocios.etapa,
      interesse: negocios.interesse,
      empreendimentoInteresseId: negocios.empreendimentoInteresseId,
      loteInteresseId: negocios.loteInteresseId,
      corretorId: negocios.corretorId,
      imobiliariaId: negocios.imobiliariaId,
      conversaId: conversas.id,
      telefone: clientes.telefone,
      instancia: whatsappConexoes.instancia,
      corretorNome: users.name,
    })
    .from(negocios)
    .innerJoin(clientes, eq(clientes.id, negocios.clienteId))
    .innerJoin(users, eq(users.id, negocios.corretorId))
    .innerJoin(
      conversas,
      and(
        eq(conversas.clienteId, negocios.clienteId),
        eq(conversas.corretorId, negocios.corretorId),
      ),
    )
    .innerJoin(
      whatsappConexoes,
      eq(whatsappConexoes.corretorId, negocios.corretorId),
    )
    .where(eq(negocios.id, negocioId));
  if (!row?.instancia) return null;
  return {
    session: sessaoDoCorretor(row.corretorId, row.imobiliariaId),
    instancia: row.instancia,
    corretor: { nome: row.corretorNome },
    conversa: { id: row.conversaId, telefone: row.telefone },
    negocio: {
      id: row.id,
      etapa: row.etapa,
      interesse: row.interesse,
      empreendimentoInteresseId: row.empreendimentoInteresseId,
      loteInteresseId: row.loteInteresseId,
    },
  };
}

// Por onde sai uma mensagem ao cliente: a instância do corretor e a conversa.
// Sem conversa (cliente cadastrado à mão que nunca escreveu): não há opt-out
// a respeitar nem onde gravar; a mensagem só sai.
export type Canal = {
  instancia: string;
  conversa: { id: string | null; telefone: string };
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
  contexto: Canal,
  opcoes: { despedida?: boolean } = {},
) {
  if (!contexto.conversa.id) return;
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

// O único caminho de uma mensagem ao cliente (spec → Assistente). A mensagem
// é gravada na conversa (autor `assistente`, ainda sem id da Evolution)
// ANTES do envio: o eco `fromMe` que o webhook entrega pode chegar antes de o
// envio devolver o id, e `receberMensagem` o reconhece pela mensagem pendente
// (ver `reivindicarEcoDoAssistente`). Depois do envio o id é gravado, a
// menos que o eco já o tenha feito. Falha no envio apaga a pendente.
async function enviarEGravar(
  canal: Canal,
  registro: { texto: string | null; midia: Midia | null },
  enviar: () => Promise<{ idMensagem: string }>,
  opcoes: { despedida?: boolean } = {},
): Promise<{ idMensagem: string }> {
  await garantirQuePodeEnviar(canal, opcoes);
  const conversaId = canal.conversa.id;
  if (!conversaId) return enviar();
  const agora = new Date();
  const [pendente] = await db
    .insert(mensagens)
    .values({
      conversaId,
      evolutionId: null,
      autor: "assistente",
      texto: registro.texto,
      midia: registro.midia,
      fromMe: true,
      enviadaEm: agora,
      criadaEm: agora,
    })
    .returning({ id: mensagens.id });
  if (!pendente) throw new Error("mensagem do assistente não gravada");

  let envio: { idMensagem: string };
  try {
    envio = await enviar();
  } catch (error) {
    await db.delete(mensagens).where(eq(mensagens.id, pendente.id));
    throw error;
  }
  try {
    await db
      .update(mensagens)
      .set({ evolutionId: envio.idMensagem })
      .where(
        and(
          eq(mensagens.id, pendente.id),
          isNull(mensagens.evolutionId),
          sql`not exists (select 1 from ${mensagens} as m where m.conversa_id = ${conversaId} and m.evolution_id = ${envio.idMensagem})`,
        ),
      );
  } catch (error) {
    // O eco deste envio já marcou outra pendente de mesmo conteúdo: esta
    // fica para o eco seguinte. Nada se perde.
    if (!isUniqueViolation(error)) throw error;
  }
  return envio;
}

export function enviarTextoAoCliente(
  canal: Canal,
  texto: string,
  opcoes: { despedida?: boolean } = {},
) {
  return enviarEGravar(
    canal,
    { texto, midia: null },
    () => whatsapp.enviarTexto(canal.instancia, canal.conversa.telefone, texto),
    opcoes,
  );
}

const tipoDaMidiaGravada = {
  image: "imagem",
  document: "documento",
  video: "video",
  audio: "audio",
} as const satisfies Record<string, Midia["tipo"]>;

export function enviarMidiaAoCliente(
  canal: Canal,
  midia: Parameters<typeof whatsapp.enviarMidia>[2],
) {
  return enviarEGravar(
    canal,
    {
      texto: midia.legenda ?? null,
      midia: {
        tipo: tipoDaMidiaGravada[midia.tipo],
        mimetype: midia.mimetype ?? null,
        nomeDoArquivo: midia.nomeDoArquivo ?? null,
        url: null,
      },
    },
    () => whatsapp.enviarMidia(canal.instancia, canal.conversa.telefone, midia),
  );
}

export function enviarLocalizacaoAoCliente(
  canal: Canal,
  local: Parameters<typeof whatsapp.enviarLocalizacao>[2],
) {
  return enviarEGravar(
    canal,
    {
      texto: whatsapp.textoDaLocalizacao(local.endereco ?? local.nome ?? null),
      midia: null,
    },
    () =>
      whatsapp.enviarLocalizacao(
        canal.instancia,
        canal.conversa.telefone,
        local,
      ),
  );
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Até quando uma mensagem pendente do assistente espera o próprio eco.
const ESPERA_DO_ECO_MS = 10 * 60 * 1000;

// Chamado por `receberMensagem` para uma mensagem `fromMe` cujo id ainda não
// está na conversa: se o assistente tem um envio pendente com o mesmo
// conteúdo (texto e tipo de mídia), é o eco dele chegando antes de o envio
// devolver o id. A pendente recebe o id e o eco não vira mensagem do
// corretor (nem pausa o assistente). Devolve se reconheceu o eco.
export async function reivindicarEcoDoAssistente(
  tx: Tx,
  conversaId: string,
  eco: Pick<MensagemRecebida, "idMensagem" | "texto" | "midia">,
): Promise<boolean> {
  const [pendente] = await tx
    .select({ id: mensagens.id })
    .from(mensagens)
    .where(
      and(
        eq(mensagens.conversaId, conversaId),
        eq(mensagens.autor, "assistente"),
        isNull(mensagens.evolutionId),
        sql`${mensagens.texto} is not distinct from ${eco.texto}::text`,
        sql`(${mensagens.midia} ->> 'tipo') is not distinct from ${eco.midia?.tipo ?? null}::text`,
        gte(mensagens.criadaEm, new Date(Date.now() - ESPERA_DO_ECO_MS)),
      ),
    )
    .orderBy(asc(mensagens.criadaEm))
    .limit(1)
    .for("update");
  if (!pendente) return false;
  const [marcada] = await tx
    .update(mensagens)
    .set({ evolutionId: eco.idMensagem })
    .where(and(eq(mensagens.id, pendente.id), isNull(mensagens.evolutionId)))
    .returning({ id: mensagens.id });
  return Boolean(marcada);
}
