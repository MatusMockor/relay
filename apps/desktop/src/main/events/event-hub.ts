export type EventListener<Event> = (event: Event) => void;

export class EventHub<Event> {
  private readonly listeners = new Set<EventListener<Event>>();

  publish(event: Event): void {
    [...this.listeners].forEach((listener) => {
      listener(event);
    });
  }

  subscribe(listener: EventListener<Event>): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  get listenerCount(): number {
    return this.listeners.size;
  }
}
