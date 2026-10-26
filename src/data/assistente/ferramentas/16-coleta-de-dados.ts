import "server-only";
import { z } from "zod";
import { formasDePagamento, tiposDeDocumento } from "@/lib/db/schema";
import {
  DiaDePagamentoInvalidoError,
  escolherLote,
  type ItemDaColeta,
  LoteIndisponivelError,
  PrimeiraParcelaForaDoPrazoError,
  registrarDadosDoCliente,
  registrarDocumentoRecebido,
  registrarPagamento,
  registrarReferencia,
  rotuloDoItem,
  statusDaColeta,
} from "../../coleta-de-dados";
import { listarLotes } from "../../lotes";
import { mudarEtapa } from "../../negocios";
import type { ContextoDoAtendimento } from "../contexto";
import type { Ferramenta } from "../ferramentas";

// Ferramentas da coleta de dados (ticket 16). Tudo passa por
// src/data/coleta-de-dados.ts com a sessão do corretor; o modelo só pede.

function definir<T extends z.ZodType>(ferramenta: Ferramenta<T>) {
  return ferramenta;
}

const NEGOCIO_NAO_ENCONTRADO = { erro: "Negócio não encontrado." };

function descreverFaltando(faltando: ItemDaColeta[]) {
  return faltando.map((item) => ({ item, descricao: rotuloDoItem[item] }));
}

async function faltandoAgora(contexto: ContextoDoAtendimento) {
  const status = await statusDaColeta(contexto.session, contexto.negocio.id);
  return status ? descreverFaltando(status.faltando) : [];
}

export const ferramentaIniciarColeta = definir({
  nome: "iniciar_coleta",
  descricao:
    "Quando o cliente decide fechar a compra (depois da visita ou sem ela): leva o negócio a Coletando dados e devolve o que é preciso coletar.",
  parametros: z.object({}),
  async executar(contexto) {
    const negocio = await mudarEtapa(
      contexto.session,
      contexto.negocio.id,
      "coletando_dados",
      { autor: "assistente" },
    );
    if (!negocio) return NEGOCIO_NAO_ENCONTRADO;
    contexto.negocio = { ...contexto.negocio, etapa: negocio.etapa };
    return { etapa: negocio.etapa, faltando: await faltandoAgora(contexto) };
  },
});

export const ferramentaRegistrarDadosDoCliente = definir({
  nome: "registrar_dados_do_cliente",
  descricao:
    "Registra no cadastro do cliente o e-mail, o número do CPF e outros contatos (telefones extras) que ele informar. Envie só o que o cliente disse.",
  parametros: z.object({
    email: z.email().nullable().optional(),
    cpf: z
      .string()
      .nullable()
      .optional()
      .describe("Número do CPF, com ou sem pontuação."),
    contatosExtras: z
      .array(z.string().min(1))
      .nullable()
      .optional()
      .describe("Outros telefones ou contatos do cliente."),
  }),
  async executar(contexto, dados) {
    const cliente = await registrarDadosDoCliente(
      contexto.session,
      contexto.negocio.id,
      dados,
    );
    if (!cliente) return NEGOCIO_NAO_ENCONTRADO;
    return { registrado: true, faltando: await faltandoAgora(contexto) };
  },
});

export const ferramentaRegistrarReferencia = definir({
  nome: "registrar_referencia",
  descricao:
    "Registra um contato de referência do cliente (nome e telefone). São necessárias duas; chame uma vez para cada.",
  parametros: z.object({
    nome: z.string().min(1),
    telefone: z.string().min(8),
  }),
  async executar(contexto, referencia) {
    const cliente = await registrarReferencia(
      contexto.session,
      contexto.negocio.id,
      referencia,
    );
    if (!cliente) return NEGOCIO_NAO_ENCONTRADO;
    return {
      referencias: cliente.referencias.length,
      faltando: await faltandoAgora(contexto),
    };
  },
});

export const ferramentaRegistrarPagamento = definir({
  nome: "registrar_pagamento",
  descricao:
    "Registra a forma de pagamento pretendida (cartão ou Pix) e o melhor dia do mês para pagar (1 a 28). A primeira parcela cai em até 90 dias; informe primeiraParcela só se o cliente pedir uma data específica.",
  parametros: z.object({
    forma: z.enum(formasDePagamento),
    dia: z.number().int().describe("Dia do mês, de 1 a 28."),
    primeiraParcela: z
      .string()
      .nullable()
      .optional()
      .describe("Data da primeira parcela (AAAA-MM-DD), se o cliente pediu."),
  }),
  async executar(contexto, pagamento) {
    try {
      const cliente = await registrarPagamento(
        contexto.session,
        contexto.negocio.id,
        pagamento,
      );
      if (!cliente) return NEGOCIO_NAO_ENCONTRADO;
      return {
        forma: cliente.formaDePagamento,
        dia: cliente.diaDePagamento,
        primeiraParcela: cliente.primeiraParcela,
        faltando: await faltandoAgora(contexto),
      };
    } catch (error) {
      if (error instanceof DiaDePagamentoInvalidoError) {
        return {
          erro: "O dia de pagamento precisa ser entre 1 e 28. Peça ao cliente outro dia.",
        };
      }
      if (error instanceof PrimeiraParcelaForaDoPrazoError) {
        return {
          erro: `${error.message}. Peça ao cliente uma data dentro desse prazo.`,
        };
      }
      throw error;
    }
  },
});

export const ferramentaRegistrarDocumento = definir({
  nome: "registrar_documento",
  descricao:
    "Registra como documento do tipo informado a foto ou arquivo que o cliente acabou de enviar (CPF, RG ou comprovante de endereço). Chame uma vez para cada documento recebido. A IA avalia só se está legível; quem aceita é o(a) corretor(a).",
  parametros: z.object({ tipo: z.enum(tiposDeDocumento) }),
  async executar(contexto, { tipo }) {
    const documento = await registrarDocumentoRecebido(
      contexto.session,
      contexto.negocio.id,
      tipo,
    );
    if (!documento) {
      return {
        erro: "Não há foto ou arquivo recebido do cliente para registrar. Peça que envie o documento.",
      };
    }
    const resultado = {
      tipo: documento.tipo,
      legivel: documento.legivel,
      faltando: await faltandoAgora(contexto),
    };
    if (documento.legivel === false) {
      return {
        ...resultado,
        motivo: documento.motivo,
        instrucao:
          "O documento parece ilegível. Explique o motivo ao cliente em uma frase e peça para reenviar uma foto nítida, inteira e sem reflexo. Não diga que foi recusado: o(a) corretor(a) ainda vai conferir.",
      };
    }
    return resultado;
  },
});

export const ferramentaEscolherLote = definir({
  nome: "escolher_lote",
  descricao:
    "Registra o lote que o cliente escolheu. Só aceita lotes disponíveis do empreendimento do negócio; se o lote não estiver disponível, devolve os disponíveis para oferecer.",
  parametros: z.object({ loteId: z.string() }),
  async executar(contexto, { loteId }) {
    try {
      const escolhido = await escolherLote(
        contexto.session,
        contexto.negocio.id,
        loteId,
      );
      if (!escolhido) return { erro: "Lote não encontrado." };
      contexto.negocio = {
        ...contexto.negocio,
        loteInteresseId: escolhido.loteInteresseId,
        empreendimentoInteresseId: escolhido.empreendimentoInteresseId,
      };
      return {
        lote: `Quadra ${escolhido.lote.quadra}, lote ${escolhido.lote.numero}`,
        faltando: await faltandoAgora(contexto),
      };
    } catch (error) {
      if (!(error instanceof LoteIndisponivelError)) throw error;
      const empreendimentoId = contexto.negocio.empreendimentoInteresseId;
      const disponiveis = empreendimentoId
        ? (await listarLotes(contexto.session, empreendimentoId)).filter(
            (l) => l.status === "disponivel",
          )
        : [];
      return {
        erro: "Esse lote não está disponível. Ofereça um dos disponíveis.",
        disponiveis: disponiveis.map((l) => ({
          loteId: l.id,
          lote: `Quadra ${l.quadra}, lote ${l.numero}`,
          area: l.area,
          preco: l.preco,
        })),
      };
    }
  },
});

export const ferramentaStatusDaColeta = definir({
  nome: "status_da_coleta",
  descricao:
    "Diz o que ainda falta coletar do cliente (documentos, e-mail, CPF, referências, forma e dia de pagamento, lote).",
  parametros: z.object({}),
  async executar(contexto) {
    const status = await statusDaColeta(contexto.session, contexto.negocio.id);
    if (!status) return NEGOCIO_NAO_ENCONTRADO;
    return {
      completa: status.completa,
      faltando: descreverFaltando(status.faltando),
    };
  },
});

export const ferramentasDaColeta: Ferramenta[] = [
  ferramentaIniciarColeta,
  ferramentaRegistrarDadosDoCliente,
  ferramentaRegistrarReferencia,
  ferramentaRegistrarPagamento,
  ferramentaRegistrarDocumento,
  ferramentaEscolherLote,
  ferramentaStatusDaColeta,
];

// Seção do prompt (concatenada em src/data/assistente/prompt.ts).
export function secaoDeColeta(contexto: ContextoDoAtendimento): string {
  const linhas = [
    "## Coleta de dados",
    "- Quando o cliente decidir fechar (depois da visita), chame iniciar_coleta. Se ele quiser fechar sem visitar, use fechar_agora.",
    "- Em Coletando dados, peça um item por vez, com calma: fotos do CPF, do RG e de um comprovante de endereço; e-mail e outros contatos; dois contatos de referência (nome e telefone); forma de pagamento (cartão ou Pix) e o melhor dia do mês para pagar (1 a 28); e o lote escolhido.",
    "- A cada foto ou arquivo de documento recebido, chame registrar_documento com o tipo. Se vier ilegível, peça o reenvio; não diga que o documento foi aprovado: quem confere é o(a) corretor(a).",
    "- Registre o que o cliente disser com registrar_dados_do_cliente, registrar_referencia, registrar_pagamento e escolher_lote (só lotes disponíveis).",
    "- Use status_da_coleta para saber o que falta. Quando nada faltar, agradeça e diga que o(a) corretor(a) vai preparar a proposta.",
    "- Nunca repita para o cliente dados pessoais de terceiros nem números completos de documentos.",
  ];
  if (contexto.negocio.etapa === "coletando_dados") {
    linhas.push("- Este negócio está em Coletando dados.");
  }
  return linhas.join("\n");
}
