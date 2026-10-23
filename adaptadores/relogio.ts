// Abstração de tempo: cadências, expiração de reserva e janela de horário
// leem a hora daqui, para que testes controlem a passagem do tempo.
export interface Relogio {
  agora(): Date;
}

export const relogioDoSistema: Relogio = {
  agora: () => new Date(),
};

export class RelogioFalso implements Relogio {
  #agora: Date;

  constructor(inicio: Date = new Date("2026-01-05T12:00:00-03:00")) {
    this.#agora = new Date(inicio);
  }

  agora() {
    return new Date(this.#agora);
  }

  definir(momento: Date) {
    this.#agora = new Date(momento);
  }

  avancar(ms: number) {
    this.#agora = new Date(this.#agora.getTime() + ms);
  }
}
