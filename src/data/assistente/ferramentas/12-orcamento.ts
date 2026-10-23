import "server-only";
import { z } from "zod";
import {
  buscarEmpreendimento,
  listarEmpreendimentos,
} from "../../empreendimentos";
import { buscarLote } from "../../lotes";
import {
  buscarResumoDoNegocio,
  escolherPlano,
  marcarForaDoOrcamento,
  registrarInteresse,
  registrarOrcamento,
} from "../../negocios";
import { type Opcao, opcoesDentroDoOrcamento } from "../../orcamento";
import { criarPendencia } from "../../pendencias";
import type { ContextoDoAtendimento } from "../contexto";
import type { Ferramenta } from "../ferramentas";

// Ferramentas de orçamento e planos (ticket 12). O modelo nunca calcula nem
// inventa valor: tudo que apresenta ao cliente vem de `listar_opcoes_no_orcamento`,
// que por sua vez só usa `calcularPlano`. Valores trocados com o modelo em
// reais; o negócio guarda centavos.

function definir<T extends z.ZodType>(ferramenta: Ferramenta<T>) {
  return ferramenta;
}

const paraCentavos = (reais: number) => Math.round(reais * 100);
const paraReais = (centavos: number) => centavos / 100;

// Resolve o empreendimento sem depender do registro geral de ferramentas (evita
// import circular): o informado, o do negócio, o do lote de interesse, ou o
// único da imobiliária.
async function empreendimentoDoNegocio(
  contexto: ContextoDoAtendimento,
  negocio: {
    empreendimentoInteresseId: string | null;
    loteInteresseId: string | null;
  },
  empreendimentoId: string | null | undefined,
) {
  const { session } = contexto;
  if (empreendimentoId) return buscarEmpreendimento(session, empreendimentoId);
  if (negocio.empreendimentoInteresseId) {
    return buscarEmpreendimento(session, negocio.empreendimentoInteresseId);
  }
  if (negocio.loteInteresseId) {
    const lote = await buscarLote(session, negocio.loteInteresseId);
    if (lote) return buscarEmpreendimento(session, lote.empreendimentoId);
  }
  const todos = await listarEmpreendimentos(session);
  return todos.length === 1 ? (todos[0] ?? null) : null;
}

function descreverOpcao(o: Opcao) {
  return {
    planoId: o.plano.id,
    plano: o.plano.nome,
    condicoes: o.plano.condicoes,
    loteId: o.lote.id,
    lote: `Quadra ${o.lote.quadra}, lote ${o.lote.numero}`,
    areaDoLote: o.lote.area,
    ...(o.modeloDeCasa
      ? { modeloDeCasaId: o.modeloDeCasa.id, modeloDeCasa: o.modeloDeCasa.nome }
      : {}),
    precoTotal: o.precoTotal,
    entrada: o.entrada,
    parcela: o.parcela,
    parcelas: o.parcelas,
  };
}

export const ferramentaRegistrarOrcamento = definir({
  nome: "registrar_orcamento",
  descricao:
    "Registra no negócio quanto o cliente pode dar de entrada e o valor máximo de parcela mensal que consegue pagar, em reais. Chame assim que o cliente informar os dois valores; depois use listar_opcoes_no_orcamento.",
  parametros: z.object({
    entrada: z
      .number()
      .min(0)
      .describe("Valor de entrada disponível, em reais."),
    parcelaMaxima: z
      .number()
      .min(0)
      .describe("Maior parcela mensal que o cliente consegue pagar, em reais."),
  }),
  async executar(contexto, { entrada, parcelaMaxima }) {
    const negocio = await registrarOrcamento(
      contexto.session,
      contexto.negocio.id,
      {
        entrada: paraCentavos(entrada),
        parcelaMaxima: paraCentavos(parcelaMaxima),
      },
    );
    if (!negocio) return { erro: "Negócio não encontrado." };
    return {
      entrada: paraReais(negocio.orcamentoEntrada ?? 0),
      parcelaMaxima: paraReais(negocio.orcamentoParcelaMaxima ?? 0),
    };
  },
});

export const ferramentaListarOpcoesNoOrcamento = definir({
  nome: "listar_opcoes_no_orcamento",
  descricao:
    "Lista as combinações de plano de pagamento + lote (ou lote + casa, conforme o interesse registrado) cujos valores calculados cabem no orçamento registrado do cliente. Se nada couber, devolve a opção mais próxima (ou um lote mais barato) e marca o negócio como fora do orçamento. Apresente ao cliente SOMENTE os valores devolvidos aqui, formatados em reais.",
  parametros: z.object({
    empreendimentoId: z
      .string()
      .nullable()
      .optional()
      .describe(
        "Id do empreendimento. Opcional quando o negócio já tem um empreendimento de interesse ou a imobiliária só tem um.",
      ),
    modeloDeCasaId: z
      .string()
      .nullable()
      .optional()
      .describe("Para lote + casa: limita a um modelo de casa específico."),
  }),
  async executar(contexto, { empreendimentoId, modeloDeCasaId }) {
    const negocio = await buscarResumoDoNegocio(
      contexto.session,
      contexto.negocio.id,
    );
    if (!negocio) return { erro: "Negócio não encontrado." };
    if (
      negocio.orcamentoEntrada === null ||
      negocio.orcamentoParcelaMaxima === null
    ) {
      return {
        erro: "Orçamento ainda não registrado: pergunte a entrada e a parcela máxima e chame registrar_orcamento.",
      };
    }
    if (!negocio.interesse) {
      return {
        erro: "Interesse ainda não registrado: pergunte se o cliente quer só o lote ou lote + casa e chame registrar_interesse.",
      };
    }
    const empreendimento = await empreendimentoDoNegocio(
      contexto,
      negocio,
      empreendimentoId,
    );
    if (!empreendimento) {
      return {
        erro: "Informe empreendimentoId: a imobiliária tem mais de um empreendimento. Use listar_empreendimentos e pergunte ao cliente qual interessa.",
      };
    }
    if (negocio.empreendimentoInteresseId !== empreendimento.id) {
      await registrarInteresse(contexto.session, negocio.id, {
        empreendimentoId: empreendimento.id,
      });
    }
    const orcamento = {
      entrada: paraReais(negocio.orcamentoEntrada),
      parcelaMaxima: paraReais(negocio.orcamentoParcelaMaxima),
    };
    const resultado = await opcoesDentroDoOrcamento(contexto.session, {
      ...orcamento,
      empreendimentoId: empreendimento.id,
      interesse: negocio.interesse,
      modeloDeCasaId,
    });
    if (!resultado)
      return { erro: "Empreendimento ou modelo de casa não encontrado." };

    if (!resultado.foraDoOrcamento) {
      return {
        empreendimento: empreendimento.nome,
        orcamento,
        dentroDoOrcamento: true,
        opcoes: resultado.opcoes.map(descreverOpcao),
      };
    }
    await marcarForaDoOrcamento(contexto.session, negocio.id);
    return {
      empreendimento: empreendimento.nome,
      orcamento,
      dentroDoOrcamento: false,
      opcoes: [],
      opcaoMaisProxima: resultado.maisProxima
        ? {
            ...descreverOpcao(resultado.maisProxima),
            estouro: resultado.maisProxima.estouro,
          }
        : null,
      aviso:
        "Nenhuma combinação cabe no orçamento. Diga isso com delicadeza, ofereça a opção mais próxima (se houver) e pergunte se o cliente quer rever a entrada ou a parcela. Não ofereça desconto.",
    };
  },
});

export const ferramentaEscolherPlano = definir({
  nome: "escolher_plano",
  descricao:
    "Registra o plano de pagamento que o cliente escolheu entre os devolvidos por listar_opcoes_no_orcamento, com o lote (e o modelo de casa) correspondentes. Chame quando o cliente confirmar uma opção.",
  parametros: z.object({
    planoId: z.string().min(1),
    loteId: z.string().nullable().optional(),
    modeloDeCasaId: z.string().nullable().optional(),
  }),
  async executar(contexto, { planoId, loteId, modeloDeCasaId }) {
    const negocio = await escolherPlano(contexto.session, contexto.negocio.id, {
      planoId,
      loteId,
      modeloDeCasaId,
    });
    if (!negocio) {
      return {
        erro: "Plano, lote ou modelo não encontrado (ou de empreendimentos diferentes).",
      };
    }
    contexto.negocio = {
      ...contexto.negocio,
      interesse: negocio.interesse,
      empreendimentoInteresseId: negocio.empreendimentoInteresseId,
      loteInteresseId: negocio.loteInteresseId,
    };
    return {
      planoEscolhidoId: negocio.planoEscolhidoId,
      loteId: negocio.loteInteresseId,
      modeloDeCasaId: negocio.modeloDeCasaEscolhidoId,
    };
  },
});

export const ferramentaPedidoDeDesconto = definir({
  nome: "pedido_de_desconto",
  descricao:
    "Chame quando o cliente pedir desconto, abatimento ou negociar preço/condições. Avisa o(a) corretor(a); você responde que a negociação é com ele(a) e que ele(a) vai entrar em contato. Nunca prometa ou sugira valores.",
  parametros: z.object({
    detalhe: z
      .string()
      .nullable()
      .optional()
      .describe(
        "O que o cliente pediu, em uma frase (ex.: 'pediu 10% na entrada').",
      ),
  }),
  async executar(contexto, { detalhe }) {
    const pendencia = await criarPendencia(contexto.session, {
      negocioId: contexto.negocio.id,
      tipo: "pedido_desconto",
      descricao: `Pedido de desconto${detalhe ? `: ${detalhe}` : ""}`,
    });
    return {
      registrado: Boolean(pendencia),
      detalhe: detalhe ?? null,
      instrucao:
        "Diga ao cliente que desconto e condições são negociados diretamente com o(a) corretor(a), que vai entrar em contato. Não ofereça nenhum valor.",
    };
  },
});

export const ferramentasDoOrcamento: Ferramenta[] = [
  ferramentaRegistrarOrcamento,
  ferramentaListarOpcoesNoOrcamento,
  ferramentaEscolherPlano,
  ferramentaPedidoDeDesconto,
];

// Seção acrescentada às instruções do assistente (src/data/assistente/prompt.ts).
export const secaoDoPromptDeOrcamento = [
  "## Orçamento e planos",
  "- Antes de apresentar qualquer plano ou valor, pergunte quanto o cliente pode dar de entrada e qual o valor máximo de parcela mensal; registre com registrar_orcamento.",
  "- Com o orçamento e o interesse registrados, chame listar_opcoes_no_orcamento e apresente SOMENTE as opções devolvidas, com entrada, valor e número de parcelas formatados em reais (ex.: R$ 1.250,00). Nunca cite valor, preço ou prazo que não tenha vindo dessa ferramenta.",
  "- Se nenhuma opção couber, diga isso com delicadeza, ofereça a opção mais próxima devolvida e pergunte se o cliente quer rever entrada ou parcela. O negócio continua.",
  "- Quando o cliente confirmar uma opção, registre com escolher_plano (plano, lote e modelo de casa da opção).",
  "- Se o cliente pedir desconto ou quiser negociar preço ou condições, não negocie nem sugira valores: chame pedido_de_desconto e diga que o(a) corretor(a) vai entrar em contato.",
].join("\n");
