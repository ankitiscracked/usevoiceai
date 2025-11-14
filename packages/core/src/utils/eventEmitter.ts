export type EventHandler<TPayload> = (payload: TPayload) => void;

export class SimpleEventEmitter<TEvents extends Record<string, any>> {
  private listeners: {
    [K in keyof TEvents]?: Set<EventHandler<TEvents[K]>>;
  } = {};

  on<K extends keyof TEvents>(event: K, handler: EventHandler<TEvents[K]>) {
    if (!this.listeners[event]) {
      this.listeners[event] = new Set();
    }
    this.listeners[event]!.add(handler);
    return () => this.off(event, handler);
  }

  once<K extends keyof TEvents>(event: K, handler: EventHandler<TEvents[K]>) {
    const wrapped: EventHandler<TEvents[K]> = (payload) => {
      this.off(event, wrapped);
      handler(payload);
    };
    return this.on(event, wrapped);
  }

  off<K extends keyof TEvents>(event: K, handler: EventHandler<TEvents[K]>) {
    this.listeners[event]?.delete(handler);
  }

  emit<K extends keyof TEvents>(event: K, payload: TEvents[K]) {
    this.listeners[event]?.forEach((listener) => {
      listener(payload);
    });
    console.log("emit", event, payload);
  }

  removeAllListeners() {
    Object.keys(this.listeners).forEach((key) => {
      this.listeners[key as keyof TEvents]?.clear();
    });
  }
}
