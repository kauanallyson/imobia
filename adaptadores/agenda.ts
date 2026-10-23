// A agenda é opcional até a decisão sobre o Google Calendar (spec, Further
// Notes): quem usa o adaptador deve tolerar corretor sem agenda conectada.

export type Intervalo = { inicio: Date; fim: Date };

export type EventoDaAgenda = Intervalo & {
  titulo: string;
  descricao?: string;
  local?: string;
};

export interface Agenda {
  horariosOcupados(
    corretorId: string,
    periodo: Intervalo,
  ): Promise<Intervalo[]>;
  criarEvento(corretorId: string, evento: EventoDaAgenda): Promise<string>;
  atualizarEvento(
    corretorId: string,
    eventoId: string,
    evento: EventoDaAgenda,
  ): Promise<void>;
  removerEvento(corretorId: string, eventoId: string): Promise<void>;
  /** null quando o evento foi removido; usado para detectar alterações. */
  buscarEvento(
    corretorId: string,
    eventoId: string,
  ): Promise<EventoDaAgenda | null>;
}

export class AgendaFalsa implements Agenda {
  /** corretorId → (eventoId → evento) */
  readonly eventos = new Map<string, Map<string, EventoDaAgenda>>();
  #proximoId = 1;

  #doCorretor(corretorId: string) {
    let eventos = this.eventos.get(corretorId);
    if (!eventos) {
      eventos = new Map();
      this.eventos.set(corretorId, eventos);
    }
    return eventos;
  }

  async horariosOcupados(corretorId: string, periodo: Intervalo) {
    return [...this.#doCorretor(corretorId).values()]
      .filter((e) => e.inicio < periodo.fim && e.fim > periodo.inicio)
      .map(({ inicio, fim }) => ({ inicio, fim }));
  }

  async criarEvento(corretorId: string, evento: EventoDaAgenda) {
    const id = `evento-${this.#proximoId++}`;
    this.#doCorretor(corretorId).set(id, { ...evento });
    return id;
  }

  async atualizarEvento(
    corretorId: string,
    eventoId: string,
    evento: EventoDaAgenda,
  ) {
    const eventos = this.#doCorretor(corretorId);
    if (!eventos.has(eventoId)) {
      throw new Error(`AgendaFalsa: evento ${eventoId} não existe`);
    }
    eventos.set(eventoId, { ...evento });
  }

  async removerEvento(corretorId: string, eventoId: string) {
    this.#doCorretor(corretorId).delete(eventoId);
  }

  async buscarEvento(corretorId: string, eventoId: string) {
    return this.#doCorretor(corretorId).get(eventoId) ?? null;
  }
}
