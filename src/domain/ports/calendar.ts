// A agenda é opcional até a decisão sobre o Google Calendar (spec, Further
// Notes): quem usa a porta deve tolerar corretor sem agenda conectada.

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
