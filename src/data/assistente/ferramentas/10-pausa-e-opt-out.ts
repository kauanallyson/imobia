import "server-only";
import { z } from "zod";
import { registrarOptOut } from "../../estado-do-assistente";
import type { Ferramenta } from "../ferramentas";

// Ticket 10: opt-out do cliente (spec → Follow-up). O modelo chama quando o
// cliente diz que não tem interesse ou pede para não receber mais mensagens.
// A conversa fica desligada em definitivo, o negócio vai a Perdido com motivo
// "sem interesse" e só a despedida desta rodada ainda sai.
const semParametros = z.object({});

export const ferramentaRegistrarOptOut: Ferramenta<typeof semParametros> = {
  nome: "registrar_opt_out",
  descricao:
    "Registra que o cliente não tem interesse ou não quer mais receber mensagens. Encerra o atendimento em definitivo e leva o negócio a Perdido. Chame assim que o cliente disser isso; depois responda só com uma despedida curta e cordial.",
  parametros: semParametros,
  async executar(contexto) {
    const conversa = await registrarOptOut(
      contexto.session,
      contexto.conversa.id,
      { negocioId: contexto.negocio.id, autor: "assistente" },
    );
    if (!conversa) return { erro: "Conversa não encontrada." };
    contexto.negocio = { ...contexto.negocio, etapa: "perdido" };
    contexto.despedidaPendente = true;
    return {
      optOut: true,
      instrucao:
        "Opt-out registrado. Envie apenas uma despedida curta; não ofereça nada nem faça perguntas.",
    };
  },
};

export const ferramentasDePausaEOptOut: Ferramenta[] = [
  ferramentaRegistrarOptOut,
];

export const secaoDeOptOut = [
  "",
  "## Sem interesse (opt-out)",
  "- Se o cliente disser que não tem interesse, que não quer mais receber mensagens ou pedir para parar, chame registrar_opt_out imediatamente e responda só com uma despedida curta. Não insista nem ofereça alternativas.",
].join("\n");
