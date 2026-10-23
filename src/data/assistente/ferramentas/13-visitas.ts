import "server-only";
import { z } from "zod";
import { formatoDataHoraBrasilia } from "@/lib/fuso";
import { mudarEtapa } from "../../negocios";
import {
  agendarVisita,
  buscarVisitaAtiva,
  HorarioIndisponivelError,
  horariosLivres,
  remarcarVisita,
  type Visita,
} from "../../visitas";
import type { ContextoDoAtendimento } from "../contexto";
import type { Ferramenta } from "../ferramentas";

// Ferramentas de visita do assistente (ticket 13, histórias 54, 55, 60, 62).
// A confirmação ao cliente (texto + localização) sai de dentro da DAL com
// `notificarCliente`, na instância do corretor.

function definir<T extends z.ZodType>(ferramenta: Ferramenta<T>) {
  return ferramenta;
}

const dataHoraISO = z
  .string()
  .describe(
    "Data e hora escolhidas, em ISO 8601 com fuso (ex.: 2026-11-02T10:00:00-03:00). Use exatamente um dataHoraISO devolvido por listar_horarios_livres.",
  );

function descrever(visita: Visita) {
  return {
    visitaId: visita.id,
    dataHoraISO: visita.dataHora.toISOString(),
    quando: formatoDataHoraBrasilia.format(visita.dataHora),
    local: visita.local,
    estado: visita.estado,
  };
}

async function tentar<T>(acao: () => Promise<T>) {
  try {
    return await acao();
  } catch (error) {
    if (error instanceof HorarioIndisponivelError) {
      return {
        erro: `Horário indisponível (${error.message}). Chame listar_horarios_livres e ofereça outras opções.`,
      };
    }
    throw error;
  }
}

export const ferramentaListarHorariosLivres = definir({
  nome: "listar_horarios_livres",
  descricao:
    "Lista os horários em que o(a) corretor(a) pode fazer a visita até domingo desta semana (visitas duram 1 hora). Ofereça ao cliente 3 a 5 opções em linguagem natural (dia da semana, data e hora).",
  parametros: z.object({
    dias: z
      .number()
      .int()
      .min(1)
      .max(7)
      .default(7)
      .describe(
        "Quantos dias procurar dentro da semana corrente, até domingo.",
      ),
  }),
  async executar(contexto, { dias }) {
    const livres = await horariosLivres(contexto.session, {
      aPartirDe: new Date(),
      dias,
    });
    return {
      horarios: livres.map((d) => ({
        dataHoraISO: d.toISOString(),
        quando: formatoDataHoraBrasilia.format(d),
      })),
      aviso:
        livres.length === 0
          ? "Nenhum horário livre nesse período; diga que o(a) corretor(a) vai propor um horário."
          : undefined,
    };
  },
});

export const ferramentaAgendarVisita = definir({
  nome: "agendar_visita",
  descricao:
    "Agenda a visita ao empreendimento no horário que o cliente escolheu entre os livres. Confirma direto (sem aprovação do corretor), já envia ao cliente a confirmação com a localização e leva o negócio a Visita agendada.",
  parametros: z.object({ dataHoraISO }),
  async executar(contexto, { dataHoraISO }) {
    const dataHora = new Date(dataHoraISO);
    if (Number.isNaN(dataHora.getTime())) {
      return { erro: "dataHoraISO inválido." };
    }
    const existente = await buscarVisitaAtiva(
      contexto.session,
      contexto.negocio.id,
    );
    if (existente) {
      return {
        erro: "Já existe uma visita marcada para este cliente; use remarcar_visita.",
        visita: descrever(existente),
      };
    }
    return tentar(async () => {
      const visita = await agendarVisita(contexto.session, {
        negocioId: contexto.negocio.id,
        dataHora,
        autor: "assistente",
        notificarCliente: true,
      });
      if (!visita) return { erro: "Negócio não encontrado." };
      contexto.negocio = { ...contexto.negocio, etapa: "visita_agendada" };
      return {
        visita: descrever(visita),
        aviso:
          "A confirmação e a localização já foram enviadas ao cliente; não repita o endereço, só confirme em uma frase.",
      };
    });
  },
});

export const ferramentaRemarcarVisita = definir({
  nome: "remarcar_visita",
  descricao:
    "Muda a visita já marcada deste cliente para outro horário livre. O cliente recebe a nova confirmação.",
  parametros: z.object({ dataHoraISO }),
  async executar(contexto, { dataHoraISO }) {
    const dataHora = new Date(dataHoraISO);
    if (Number.isNaN(dataHora.getTime())) {
      return { erro: "dataHoraISO inválido." };
    }
    const atual = await buscarVisitaAtiva(
      contexto.session,
      contexto.negocio.id,
    );
    if (!atual) {
      return { erro: "Não há visita marcada; use agendar_visita." };
    }
    return tentar(async () => {
      const visita = await remarcarVisita(contexto.session, atual.id, {
        dataHora,
        autor: "assistente",
        notificarCliente: true,
      });
      if (!visita) return { erro: "Visita não encontrada." };
      return { visita: descrever(visita) };
    });
  },
});

export const ferramentaFecharAgora = definir({
  nome: "fechar_agora",
  descricao:
    "Quando o cliente já está decidido e quer comprar sem visitar: pula a visita e leva o negócio a Coletando dados, para começar a coleta de documentos.",
  parametros: z.object({}),
  async executar(contexto) {
    const negocio = await mudarEtapa(
      contexto.session,
      contexto.negocio.id,
      "coletando_dados",
      { autor: "assistente" },
    );
    if (!negocio) return { erro: "Negócio não encontrado." };
    contexto.negocio = { ...contexto.negocio, etapa: negocio.etapa };
    return { etapa: negocio.etapa };
  },
});

export const ferramentasDeVisita: Ferramenta[] = [
  ferramentaListarHorariosLivres,
  ferramentaAgendarVisita,
  ferramentaRemarcarVisita,
  ferramentaFecharAgora,
];

// Seção do prompt (concatenada em src/data/assistente/prompt.ts).
export function secaoDeVisitas(contexto: ContextoDoAtendimento): string {
  return [
    "## Visitas",
    "- Quando o cliente quiser conhecer o empreendimento, chame listar_horarios_livres e ofereça de 3 a 5 opções; nunca invente horário.",
    "- Com a escolha do cliente, chame agendar_visita com o dataHoraISO exato da opção. A visita fica marcada na hora, sem confirmação do(a) corretor(a).",
    "- Se o cliente não puder ir, ofereça horários livres de novo e chame remarcar_visita.",
    "- Se o cliente já estiver decidido e quiser comprar sem visitar, chame fechar_agora.",
    contexto.negocio.etapa === "visita_agendada"
      ? "- Este cliente já tem visita marcada."
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}
