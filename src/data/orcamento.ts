import "server-only";
import type { Interesse } from "@/lib/db/schema";
import { buscarEmpreendimento } from "./empreendimentos";
import { type Lote, listarLotes } from "./lotes";
import {
  buscarModeloDeCasa,
  listarModelosDeCasa,
  type ModeloDeCasa,
} from "./modelos-de-casa";
import {
  calcularPlano,
  listarPlanosDePagamento,
  type PlanoDePagamento,
} from "./planos-de-pagamento";
import type { Session } from "./session";

// Orçamento e planos (ticket 12). O assistente só oferece combinações
// plano + lote (ou lote + casa) cujo cálculo cabe no que o cliente disse que
// pode pagar. Todo número aqui sai de `calcularPlano`: este módulo filtra e
// ordena, nunca calcula por conta própria.
//
// Valores em reais (como `lotes.preco` e `calcularPlano`); as comparações
// são feitas em centavos inteiros.

// O que o cliente pode pagar, em reais.
export type Orcamento = { entrada: number; parcelaMaxima: number };

export type Opcao = {
  lote: Lote;
  modeloDeCasa?: ModeloDeCasa;
  plano: PlanoDePagamento;
  precoTotal: number;
  entrada: number;
  parcela: number;
  parcelas: number;
};

export type OpcaoMaisProxima = Opcao & {
  // Quanto (em reais) a opção passa do orçamento, somando entrada e parcela.
  estouro: number;
};

export type ResultadoDoOrcamento =
  | { foraDoOrcamento: false; opcoes: Opcao[] }
  | { foraDoOrcamento: true; maisProxima: OpcaoMaisProxima | null };

const centavos = (reais: number) => Math.round(reais * 100);

// Todas as combinações do interesse do cliente: lote × plano, ou
// lote × modelo × plano. Ordenadas pela parcela (depois pelo preço total).
export function montarOpcoes(input: {
  interesse: Interesse;
  lotes: Lote[];
  modelos?: ModeloDeCasa[];
  planos: PlanoDePagamento[];
}): Opcao[] {
  const opcoes: Opcao[] = [];
  const modelos: Array<ModeloDeCasa | undefined> =
    input.interesse === "lote_e_casa" ? (input.modelos ?? []) : [undefined];
  for (const lote of input.lotes) {
    for (const modeloDeCasa of modelos) {
      const precoTotal =
        (centavos(lote.preco) + centavos(modeloDeCasa?.preco ?? 0)) / 100;
      for (const plano of input.planos) {
        opcoes.push({
          lote,
          ...(modeloDeCasa ? { modeloDeCasa } : {}),
          plano,
          precoTotal,
          ...calcularPlano({ precoTotal, plano }),
        });
      }
    }
  }
  return opcoes.sort(
    (a, b) =>
      centavos(a.parcela) - centavos(b.parcela) ||
      centavos(a.precoTotal) - centavos(b.precoTotal),
  );
}

export function filtrarPorOrcamento(
  opcoes: Opcao[],
  orcamento: Orcamento,
): Opcao[] {
  const entrada = centavos(orcamento.entrada);
  const parcela = centavos(orcamento.parcelaMaxima);
  return opcoes.filter(
    (o) => centavos(o.entrada) <= entrada && centavos(o.parcela) <= parcela,
  );
}

// Quando nada cabe, ofereça a combinação disponível de menor valor total.
// Empates preferem o menor estouro do orçamento e, depois, o lote mais barato.
export function opcaoMaisProxima(
  opcoes: Opcao[],
  orcamento: Orcamento,
): OpcaoMaisProxima | null {
  const entrada = centavos(orcamento.entrada);
  const parcela = centavos(orcamento.parcelaMaxima);
  let melhor: (OpcaoMaisProxima & { estouroCentavos: number }) | null = null;
  for (const opcao of opcoes) {
    const estouroCentavos =
      Math.max(0, centavos(opcao.entrada) - entrada) +
      Math.max(0, centavos(opcao.parcela) - parcela);
    if (
      !melhor ||
      centavos(opcao.precoTotal) < centavos(melhor.precoTotal) ||
      (centavos(opcao.precoTotal) === centavos(melhor.precoTotal) &&
        (estouroCentavos < melhor.estouroCentavos ||
          (estouroCentavos === melhor.estouroCentavos &&
            centavos(opcao.lote.preco) < centavos(melhor.lote.preco))))
    ) {
      melhor = { ...opcao, estouro: estouroCentavos / 100, estouroCentavos };
    }
  }
  if (!melhor) return null;
  const { estouroCentavos: _, ...resultado } = melhor;
  return resultado;
}

export function escolherOpcao(
  opcoes: Opcao[],
  orcamento: Orcamento,
): ResultadoDoOrcamento {
  const dentro = filtrarPorOrcamento(opcoes, orcamento);
  if (dentro.length > 0) return { foraDoOrcamento: false, opcoes: dentro };
  return {
    foraDoOrcamento: true,
    maisProxima: opcaoMaisProxima(opcoes, orcamento),
  };
}

// Opções do empreendimento que cabem no orçamento, ou a mais próxima. Só
// lotes `disponivel`; com `modeloDeCasaId`, só aquele modelo. Empreendimento
// (ou modelo) fora da imobiliária → null.
export async function opcoesDentroDoOrcamento(
  session: Session,
  input: Orcamento & {
    empreendimentoId: string;
    interesse: Interesse;
    modeloDeCasaId?: string | null;
  },
): Promise<ResultadoDoOrcamento | null> {
  const empreendimento = await buscarEmpreendimento(
    session,
    input.empreendimentoId,
  );
  if (!empreendimento) return null;

  let modelos: ModeloDeCasa[] = [];
  if (input.interesse === "lote_e_casa") {
    if (input.modeloDeCasaId) {
      const modelo = await buscarModeloDeCasa(session, input.modeloDeCasaId);
      if (!modelo || modelo.empreendimentoId !== empreendimento.id) {
        return null;
      }
      modelos = [modelo];
    } else {
      modelos = await listarModelosDeCasa(session, empreendimento.id);
    }
  }
  const [todosOsLotes, planos] = await Promise.all([
    listarLotes(session, empreendimento.id),
    listarPlanosDePagamento(session, empreendimento.id),
  ]);
  const opcoes = montarOpcoes({
    interesse: input.interesse,
    lotes: todosOsLotes.filter((l) => l.status === "disponivel"),
    modelos,
    planos,
  });
  return escolherOpcao(opcoes, input);
}
