// A agenda é opcional até a decisão sobre o Google Calendar (spec, Further
// Notes): quem usa o adaptador deve tolerar corretor sem agenda conectada.

export type Interval = { start: Date; end: Date };

export type CalendarEvent = Interval & {
  title: string;
  description?: string;
  location?: string;
};

export interface Calendar {
  busyIntervals(corretorId: string, period: Interval): Promise<Interval[]>;
  createEvent(corretorId: string, event: CalendarEvent): Promise<string>;
  updateEvent(
    corretorId: string,
    eventId: string,
    event: CalendarEvent,
  ): Promise<void>;
  deleteEvent(corretorId: string, eventId: string): Promise<void>;
  /** null quando o evento foi removido; usado para detectar alterações. */
  getEvent(corretorId: string, eventId: string): Promise<CalendarEvent | null>;
}

export class CalendarFake implements Calendar {
  /** corretorId → (eventId → event) */
  readonly events = new Map<string, Map<string, CalendarEvent>>();
  #nextId = 1;

  #eventsOf(corretorId: string) {
    let events = this.events.get(corretorId);
    if (!events) {
      events = new Map();
      this.events.set(corretorId, events);
    }
    return events;
  }

  async busyIntervals(corretorId: string, period: Interval) {
    return [...this.#eventsOf(corretorId).values()]
      .filter((e) => e.start < period.end && e.end > period.start)
      .map(({ start, end }) => ({ start, end }));
  }

  async createEvent(corretorId: string, event: CalendarEvent) {
    const id = `event-${this.#nextId++}`;
    this.#eventsOf(corretorId).set(id, { ...event });
    return id;
  }

  async updateEvent(corretorId: string, eventId: string, event: CalendarEvent) {
    const events = this.#eventsOf(corretorId);
    if (!events.has(eventId)) {
      throw new Error(`CalendarFake: event ${eventId} does not exist`);
    }
    events.set(eventId, { ...event });
  }

  async deleteEvent(corretorId: string, eventId: string) {
    this.#eventsOf(corretorId).delete(eventId);
  }

  async getEvent(corretorId: string, eventId: string) {
    return this.#eventsOf(corretorId).get(eventId) ?? null;
  }
}
