import type { Clock } from "@/domain/ports/clock";

export class ClockFake implements Clock {
  #now: Date;

  constructor(start: Date = new Date("2026-01-05T12:00:00-03:00")) {
    this.#now = new Date(start);
  }

  now() {
    return new Date(this.#now);
  }

  set(moment: Date) {
    this.#now = new Date(moment);
  }

  advance(ms: number) {
    this.#now = new Date(this.#now.getTime() + ms);
  }
}
