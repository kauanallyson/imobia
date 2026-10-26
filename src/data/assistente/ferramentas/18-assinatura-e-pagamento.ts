import "server-only";
import { z } from "zod";
import {
  ForaDaEtapaError,
  registrarComprovanteDePagamento,
  registrarPropostaAssinada,
  SemPropostaAssinadaError,
} from "../../assinatura-e-pagamento";
import type { ContextoDoAtendimento } from "../contexto";
import type { Ferramenta } from "../ferramentas";

// Ferramentas do fechamento (ticket 18): o assistente só guarda o arquivo e
// avisa o corretor; quem confirma assinatura e pagamento é o corretor.

function definir<T extends z.ZodType>(ferramenta: Ferramenta<T>) {
  return ferramenta;
}

function erroDeEtapa(error: unknown) {
  if (error instanceof ForaDaEtapaError) {
    return {
      erro: "Este negócio não está nessa etapa. Não registre o arquivo; responda normalmente.",
    };
  }
  if (error instanceof SemPropostaAssinadaError) {
    return {
      erro: "Não há proposta aguardando esse arquivo. Diga que o(a) corretor(a) vai verificar.",
    };
  }
  return null;
}

export const ferramentaRegistrarPropostaAssinada = definir({
  nome: "registrar_proposta_assinada",
  descricao:
    "Em Aguardando assinatura: registra o PDF da proposta assinada no gov.br que o cliente acabou de enviar e avisa o(a) corretor(a) para conferir a assinatura.",
  parametros: z.object({}),
  async executar(contexto: ContextoDoAtendimento) {
    try {
      const arquivo = await registrarPropostaAssinada(
        contexto.session,
        contexto.negocio.id,
      );
      if (!arquivo) {
        return {
          erro: "Não há PDF recebido do cliente. Peça que envie o PDF assinado (o arquivo, não uma foto).",
        };
      }
      return {
        registrado: true,
        instrucao:
          "Agradeça e diga que o(a) corretor(a) vai conferir a assinatura e, em seguida, você envia os dados para o pagamento da entrada.",
      };
    } catch (error) {
      const resposta = erroDeEtapa(error);
      if (resposta) return resposta;
      throw error;
    }
  },
});

export const ferramentaRegistrarComprovanteDePagamento = definir({
  nome: "registrar_comprovante_de_pagamento",
  descricao:
    "Em Aguardando pagamento: registra a foto ou o PDF do comprovante de pagamento da entrada que o cliente acabou de enviar e avisa o(a) corretor(a) para confirmar.",
  parametros: z.object({}),
  async executar(contexto: ContextoDoAtendimento) {
    try {
      const arquivo = await registrarComprovanteDePagamento(
        contexto.session,
        contexto.negocio.id,
      );
      if (!arquivo) {
        return {
          erro: "Não há foto ou arquivo recebido do cliente. Peça que envie o comprovante.",
        };
      }
      return {
        registrado: true,
        instrucao:
          "Agradeça e diga que o(a) corretor(a) vai confirmar o pagamento. Não diga que o pagamento foi confirmado.",
      };
    } catch (error) {
      const resposta = erroDeEtapa(error);
      if (resposta) return resposta;
      throw error;
    }
  },
});

export const ferramentasDeAssinaturaEPagamento: Ferramenta[] = [
  ferramentaRegistrarPropostaAssinada,
  ferramentaRegistrarComprovanteDePagamento,
];

// Seção do prompt (concatenada em src/data/assistente/prompt.ts).
export function secaoDeAssinaturaEPagamento(
  contexto: ContextoDoAtendimento,
): string {
  const linhas = [
    "## Assinatura e pagamento",
    "- Em Aguardando assinatura, quando o cliente mandar o PDF da proposta assinada, chame registrar_proposta_assinada. Se ele tiver dúvida, explique: acessar https://assinador.iti.br com a conta gov.br, enviar o PDF, assinar e mandar o PDF assinado aqui.",
    "- Em Aguardando pagamento, quando o cliente mandar o comprovante (foto ou PDF), chame registrar_comprovante_de_pagamento.",
    "- Você não processa pagamentos nem confirma assinatura ou pagamento: quem confirma é o(a) corretor(a). Nunca informe valores ou dados de pagamento que não vieram de uma ferramenta ou das instruções já enviadas.",
  ];
  if (contexto.negocio.etapa === "aguardando_assinatura") {
    linhas.push("- Este negócio está em Aguardando assinatura.");
  }
  if (contexto.negocio.etapa === "aguardando_pagamento") {
    linhas.push("- Este negócio está em Aguardando pagamento.");
  }
  return linhas.join("\n");
}
