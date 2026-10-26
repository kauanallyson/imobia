import { instanteEmBrasilia, partesEmBrasilia, somarDias } from "@/lib/fuso";
import { dentroDaJanelaDeAvisos } from "./pendencias";

// Cadência do follow-up e janela de envio (spec → Horário e Follow-up;
// ticket 15). Funções puras: recebem o instante, nunca leem o relógio. Os
// lembretes das etapas finais (tickets 16/18) podem reaproveitar
// `proximaJanelaDeEnvio` e `naJanelaDeEnvio`.

const DIA_MS = 24 * 60 * 60 * 1000;

// Silêncio máximo: depois disso o negócio fica "silencioso" e nada mais sai.
export const SILENCIO_MAXIMO_DIAS = 90;

// 8h–20h, segunda a sábado, horário de Brasília.
export const naJanelaDeEnvio = dentroDaJanelaDeAvisos;

// O primeiro instante dentro da janela a partir de `instante` (ele mesmo,
// se já está dentro).
export function proximaJanelaDeEnvio(instante: Date): Date {
  if (naJanelaDeEnvio(instante)) return instante;
  const { data, hora, diaDaSemana } = partesEmBrasilia(instante);
  if (diaDaSemana !== 0 && hora < 8) return instanteEmBrasilia(data, "08:00");
  let dia = somarDias(data, 1);
  if (new Date(`${dia}T12:00:00Z`).getUTCDay() === 0) dia = somarDias(dia, 1);
  return instanteEmBrasilia(dia, "08:00");
}

// Dias após a última mensagem do cliente: 1, 3, 7 e depois a cada 14,
// enquanto não passar de 90.
export function diasDoFollowUp(): number[] {
  const dias = [1, 3, 7];
  for (let d = 21; d <= SILENCIO_MAXIMO_DIAS; d += 14) dias.push(d);
  return dias;
}

export type PassoDoFollowUp = { sequencia: number; devidoEm: Date };

// Todos os passos contados de `ultimaMensagemDoCliente`, cada um deslocado
// para a próxima janela de envio.
export function agendaDoFollowUp(
  ultimaMensagemDoCliente: Date,
): PassoDoFollowUp[] {
  return diasDoFollowUp().map((dias, i) => ({
    sequencia: i + 1,
    devidoEm: proximaJanelaDeEnvio(
      new Date(ultimaMensagemDoCliente.getTime() + dias * DIA_MS),
    ),
  }));
}

// O passo que deve sair agora, ou null. Fora da janela nada sai. Se vários
// passos ainda não enviados já venceram (worker parado, job novo), sai só o
// mais recente: o cliente não recebe uma rajada.
export function followUpDevido(
  ultimaMensagemDoCliente: Date,
  ultimaSequenciaEnviada: number,
  agora: Date,
): PassoDoFollowUp | null {
  if (!naJanelaDeEnvio(agora)) return null;
  const vencidos = agendaDoFollowUp(ultimaMensagemDoCliente).filter(
    (p) =>
      p.sequencia > ultimaSequenciaEnviada &&
      p.devidoEm.getTime() <= agora.getTime(),
  );
  return vencidos.at(-1) ?? null;
}

// O instante a partir do qual o negócio fica silencioso.
export function inicioDoSilencio(ultimaMensagemDoCliente: Date): Date {
  return new Date(
    ultimaMensagemDoCliente.getTime() + SILENCIO_MAXIMO_DIAS * DIA_MS,
  );
}

export function estaSilencioso(
  ultimaMensagemDoCliente: Date,
  agora: Date,
): boolean {
  return agora.getTime() >= inicioDoSilencio(ultimaMensagemDoCliente).getTime();
}
