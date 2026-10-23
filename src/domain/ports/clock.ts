// Abstração de tempo: cadências, expiração de reserva e janela de horário
// leem a hora daqui, para que testes controlem a passagem do tempo.
export interface Clock {
  now(): Date;
}
