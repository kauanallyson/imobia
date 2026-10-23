import "server-only";
import { z } from "zod";
import { interesses } from "@/lib/db/schema";
import type { FerramentaDoModelo } from "@/lib/llm";
import * as whatsapp from "@/lib/whatsapp";
import { buscarNaBaseDeConhecimento } from "../base-de-conhecimento";
import {
  buscarEmpreendimento,
  listarEmpreendimentos,
} from "../empreendimentos";
import { buscarLote } from "../lotes";
import { materiaisPara, urlDoMaterial } from "../materiais-de-marketing";
import { mudarEtapa, registrarInteresse } from "../negocios";
import {
  type ContextoDoAtendimento,
  gravarMensagemDoAssistente,
} from "./contexto";
import { ferramentasDeVisita } from "./ferramentas/13-visitas";

// Registro de ferramentas do assistente (spec → Assistente → Ferramentas).
// Cada ferramenta é uma chamada a uma função de src/data com a sessão do
// corretor: o modelo nunca toca o banco. Tickets seguintes (orçamento,
// visitas, pendências, documentos...) acrescentam entradas em `ferramentas`.

// biome-ignore lint/suspicious/noExplicitAny: o registro mistura schemas distintos
export type Ferramenta<T extends z.ZodType = any> = {
  nome: string;
  descricao: string;
  parametros: T;
  // O que a ferramenta devolve vira JSON para o modelo.
  executar(contexto: ContextoDoAtendimento, args: z.infer<T>): Promise<unknown>;
};

function definir<T extends z.ZodType>(ferramenta: Ferramenta<T>) {
  return ferramenta;
}

// Empreendimento sobre o qual a ferramenta age: o informado pelo modelo, o
// já registrado no negócio, o do lote de interesse, ou o único da
// imobiliária. Sem candidato, a ferramenta pede ao modelo que escolha.
async function empreendimentoDoAtendimento(
  contexto: ContextoDoAtendimento,
  empreendimentoId: string | null | undefined,
) {
  const { session, negocio } = contexto;
  if (empreendimentoId) {
    const encontrado = await buscarEmpreendimento(session, empreendimentoId);
    if (!encontrado) return null;
    await fixarEmpreendimento(contexto, encontrado.id);
    return encontrado;
  }
  if (negocio.empreendimentoInteresseId) {
    return buscarEmpreendimento(session, negocio.empreendimentoInteresseId);
  }
  if (negocio.loteInteresseId) {
    const lote = await buscarLote(session, negocio.loteInteresseId);
    if (lote) {
      await fixarEmpreendimento(contexto, lote.empreendimentoId);
      return buscarEmpreendimento(session, lote.empreendimentoId);
    }
  }
  const todos = await listarEmpreendimentos(session);
  if (todos.length === 1 && todos[0]) {
    await fixarEmpreendimento(contexto, todos[0].id);
    return todos[0];
  }
  return null;
}

async function fixarEmpreendimento(
  contexto: ContextoDoAtendimento,
  empreendimentoId: string,
) {
  if (contexto.negocio.empreendimentoInteresseId === empreendimentoId) return;
  const atualizado = await registrarInteresse(
    contexto.session,
    contexto.negocio.id,
    { empreendimentoId },
  );
  if (atualizado) contexto.negocio = { ...contexto.negocio, ...atualizado };
}

const SEM_EMPREENDIMENTO = {
  erro: "Informe empreendimentoId: a imobiliária tem mais de um empreendimento. Use listar_empreendimentos e pergunte ao cliente qual interessa.",
};

const empreendimentoIdParam = z
  .string()
  .nullable()
  .optional()
  .describe(
    "Id do empreendimento. Opcional quando o negócio já tem um empreendimento de interesse ou a imobiliária só tem um.",
  );

const tipoDeMidia = {
  pdf: "document",
  imagem: "image",
  video: "video",
} as const;
const tipoDaMidiaGravada = {
  pdf: "documento",
  imagem: "imagem",
  video: "video",
} as const;

export const ferramentaListarEmpreendimentos = definir({
  nome: "listar_empreendimentos",
  descricao:
    "Lista os empreendimentos (loteamentos) que a imobiliária vende, com cidade e endereço. Use para descobrir sobre qual empreendimento o cliente fala quando houver mais de um.",
  parametros: z.object({}),
  async executar(contexto) {
    const lista = await listarEmpreendimentos(contexto.session);
    return lista.map((e) => ({
      id: e.id,
      nome: e.nome,
      cidade: e.cidade,
      endereco: e.endereco,
      incorporadora: e.incorporadora,
    }));
  },
});

export const ferramentaBuscarBaseDeConhecimento = definir({
  nome: "buscar_base_de_conhecimento",
  descricao:
    "Busca na base de conhecimento do empreendimento (localização, infraestrutura, perguntas frequentes) os trechos que respondem à pergunta do cliente. Responda só com o que vier daqui; se não vier nada útil, diga ao cliente que vai verificar com o corretor.",
  parametros: z.object({
    pergunta: z.string().min(1).describe("A dúvida do cliente, em uma frase."),
    empreendimentoId: empreendimentoIdParam,
  }),
  async executar(contexto, { pergunta, empreendimentoId }) {
    const empreendimento = await empreendimentoDoAtendimento(
      contexto,
      empreendimentoId,
    );
    if (!empreendimento) return SEM_EMPREENDIMENTO;
    const trechos = await buscarNaBaseDeConhecimento(contexto.session, {
      empreendimentoId: empreendimento.id,
      pergunta,
    });
    // TODO(ticket 11): sem trecho relevante, criar a pendência "pergunta sem
    // resposta" para o corretor.
    return {
      empreendimento: empreendimento.nome,
      trechos: (trechos ?? []).map((t) => t.texto),
    };
  },
});

export const ferramentaEnviarMaterialDeMarketing = definir({
  nome: "enviar_material_de_marketing",
  descricao:
    "Envia ao cliente, pelo WhatsApp, o material de marketing do empreendimento (PDFs, imagens, vídeos) marcado para o interesse dele: só o lote ou lote + casa. Chame depois que o cliente disser o que procura.",
  parametros: z.object({
    destino: z
      .enum(interesses)
      .describe(
        "'lote' para quem quer só o terreno; 'lote_e_casa' para quem quer lote com casa.",
      ),
    empreendimentoId: empreendimentoIdParam,
  }),
  async executar(contexto, { destino, empreendimentoId }) {
    const empreendimento = await empreendimentoDoAtendimento(
      contexto,
      empreendimentoId,
    );
    if (!empreendimento) return SEM_EMPREENDIMENTO;
    const materiais = await materiaisPara(
      contexto.session,
      empreendimento.id,
      destino,
    );
    const enviados: string[] = [];
    for (const material of materiais) {
      const url = await urlDoMaterial(contexto.session, material.id);
      if (!url) continue;
      const { idMensagem } = await whatsapp.enviarMidia(
        contexto.instancia,
        contexto.conversa.telefone,
        {
          tipo: tipoDeMidia[material.tipoDeArquivo],
          url,
          mimetype: material.contentType,
          legenda: material.nome,
          nomeDoArquivo: material.nome,
        },
      );
      await gravarMensagemDoAssistente(contexto, {
        idMensagem,
        texto: material.nome,
        midia: {
          tipo: tipoDaMidiaGravada[material.tipoDeArquivo],
          mimetype: material.contentType,
          nomeDoArquivo: material.nome,
          url: null,
        },
      });
      enviados.push(material.nome);
    }
    if (enviados.length === 0) {
      return {
        empreendimento: empreendimento.nome,
        enviados,
        aviso:
          "Não há material cadastrado para esse interesse; diga ao cliente que o corretor enviará.",
      };
    }
    return { empreendimento: empreendimento.nome, enviados };
  },
});

export const ferramentaRegistrarInteresse = definir({
  nome: "registrar_interesse",
  descricao:
    "Registra no negócio o que o cliente procura (só lote ou lote + casa) e, se souber, o empreendimento. Chame assim que o cliente disser.",
  parametros: z.object({
    interesse: z.enum(interesses),
    empreendimentoId: empreendimentoIdParam,
  }),
  async executar(contexto, { interesse, empreendimentoId }) {
    if (
      empreendimentoId &&
      !(await buscarEmpreendimento(contexto.session, empreendimentoId))
    ) {
      return { erro: "Empreendimento não encontrado." };
    }
    // Sem id, ainda tenta inferir o empreendimento (o único da imobiliária,
    // o do lote de interesse); pode continuar indefinido.
    const empreendimento = await empreendimentoDoAtendimento(
      contexto,
      empreendimentoId,
    );
    const atualizado = await registrarInteresse(
      contexto.session,
      contexto.negocio.id,
      { interesse, empreendimentoId: empreendimento?.id },
    );
    if (!atualizado) return { erro: "Negócio não encontrado." };
    contexto.negocio = { ...contexto.negocio, ...atualizado };
    return {
      interesse: atualizado.interesse,
      empreendimentoId: atualizado.empreendimentoInteresseId,
    };
  },
});

// Etapas que o assistente pode definir sozinho. Outros tickets ampliam
// (visita agendada, coletando dados...).
const etapasDoAssistente = ["em_atendimento"] as const;

export const ferramentaMudarEtapa = definir({
  nome: "mudar_etapa",
  descricao:
    "Leva o negócio à etapa informada no funil do corretor. 'em_atendimento' quando a conversa com o cliente começa.",
  parametros: z.object({ etapa: z.enum(etapasDoAssistente) }),
  async executar(contexto, { etapa }) {
    const negocio = await mudarEtapa(
      contexto.session,
      contexto.negocio.id,
      etapa,
      {
        autor: "assistente",
      },
    );
    if (!negocio) return { erro: "Negócio não encontrado." };
    contexto.negocio = { ...contexto.negocio, etapa: negocio.etapa };
    return { etapa: negocio.etapa };
  },
});

export const ferramentas: Ferramenta[] = [
  ferramentaListarEmpreendimentos,
  ferramentaBuscarBaseDeConhecimento,
  ferramentaEnviarMaterialDeMarketing,
  ferramentaRegistrarInteresse,
  ferramentaMudarEtapa,
  ...ferramentasDeVisita, // ticket 13
];

// JSON Schema que vai para a Responses API.
export function descreverFerramentas(): FerramentaDoModelo[] {
  return ferramentas.map((f) => {
    const { $schema: _, ...schema } = z.toJSONSchema(f.parametros, {
      io: "input",
    });
    return { nome: f.nome, descricao: f.descricao, parametros: schema };
  });
}

// Executa uma chamada pedida pelo modelo. Argumentos inválidos ou erro na
// execução voltam como `{ erro }` para o modelo se corrigir, nunca derrubam
// o atendimento.
export async function executarFerramenta(
  contexto: ContextoDoAtendimento,
  chamada: { nome: string; argumentos: unknown },
): Promise<unknown> {
  const ferramenta = ferramentas.find((f) => f.nome === chamada.nome);
  if (!ferramenta) return { erro: `Ferramenta desconhecida: ${chamada.nome}` };
  const args = ferramenta.parametros.safeParse(chamada.argumentos ?? {});
  if (!args.success) {
    return { erro: `Argumentos inválidos: ${z.prettifyError(args.error)}` };
  }
  try {
    return await ferramenta.executar(contexto, args.data);
  } catch (error) {
    console.error(`assistente: ferramenta ${chamada.nome} falhou`, error);
    return {
      erro: "A ferramenta falhou; tente de outra forma ou avise que vai verificar.",
    };
  }
}
