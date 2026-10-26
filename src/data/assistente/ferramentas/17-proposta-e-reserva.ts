import "server-only";
import { z } from "zod";
import { LoteIndisponivelError, rotuloDoItem } from "../../coleta-de-dados";
import {
  ColetaIncompletaError,
  gerarProposta,
  SemModeloDePropostaError,
} from "../../propostas";
import type { ContextoDoAtendimento } from "../contexto";
import type { Ferramenta } from "../ferramentas";

// Ferramenta da proposta (ticket 17): o assistente só pede; quem gera é
// src/data/propostas.ts, e quem aprova e envia é o corretor.

function definir<T extends z.ZodType>(ferramenta: Ferramenta<T>) {
  return ferramenta;
}

export const ferramentaSolicitarProposta = definir({
  nome: "solicitar_proposta",
  descricao:
    "Quando a coleta de dados estiver completa: gera a proposta para o(a) corretor(a) revisar e leva o negócio a Proposta em revisão. Não envia nada ao cliente.",
  parametros: z.object({}),
  async executar(contexto: ContextoDoAtendimento) {
    try {
      const proposta = await gerarProposta(
        contexto.session,
        contexto.negocio.id,
        { autor: "assistente" },
      );
      if (!proposta) return { erro: "Negócio não encontrado." };
      if (proposta.estado === "em_revisao") {
        contexto.negocio = {
          ...contexto.negocio,
          etapa: "proposta_em_revisao",
        };
      }
      return {
        estado: proposta.estado,
        instrucao:
          "Diga ao cliente que a proposta foi preparada e que o(a) corretor(a) vai revisar e enviar em breve, com as instruções para assinar no gov.br. Não informe valores além dos já combinados.",
      };
    } catch (error) {
      if (error instanceof ColetaIncompletaError) {
        return {
          erro: "Ainda faltam dados para a proposta. Peça ao cliente o que falta.",
          faltando: error.faltando.map((item) => ({
            item,
            descricao:
              item === "plano" ? "plano de pagamento" : rotuloDoItem[item],
          })),
        };
      }
      if (error instanceof LoteIndisponivelError) {
        return {
          erro: "O lote escolhido não está mais disponível. Peça ao cliente que escolha outro (use escolher_lote).",
        };
      }
      if (error instanceof SemModeloDePropostaError) {
        return {
          erro: "A proposta ainda não pode ser gerada. Diga que o(a) corretor(a) vai preparar e enviar.",
        };
      }
      throw error;
    }
  },
});

export const ferramentasDaProposta: Ferramenta[] = [
  ferramentaSolicitarProposta,
];

// Seção do prompt (concatenada em src/data/assistente/prompt.ts).
export const secaoDaProposta = [
  "## Proposta",
  "- Quando status_da_coleta disser que a coleta está completa e houver plano escolhido, chame solicitar_proposta.",
  "- A proposta só vai ao cliente depois que o(a) corretor(a) revisar e aprovar; não prometa prazos nem reserve lotes você mesmo.",
].join("\n");
