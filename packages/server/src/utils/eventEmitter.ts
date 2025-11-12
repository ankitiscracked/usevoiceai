type Handler<T> = (payload: T) => void;

export class EventEmitter<TEvents extends Record<string, any>> {
  private listeners: {
    [K in keyof TEvents]?: Set<Handler<TEvents[K]>>;
  } = {};

  on<K extends keyof TEvents>(event: K, handler: Handler<TEvents[K]>) {
    if (!this.listeners[event]) {
      this.listeners[event] = new Set();
    }
    this.listeners[event]!.add(handler);
    return () => this.off(event, handler);
  }

  once<K extends keyof TEvents>(event: K, handler: Handler<TEvents[K]>) {
    const wrapped: Handler<TEvents[K]> = (payload) => {
      this.off(event, wrapped);
      handler(payload);
    };
    return this.on(event, wrapped);
  }

  off<K extends keyof TEvents>(event: K, handler: Handler<TEvents[K]>) {
    this.listeners[event]?.delete(handler);
  }

  emit<K extends keyof TEvents>(event: K, payload: TEvents[K]) {
    this.listeners[event]?.forEach((listener) => {
      listener(payload);
    });
  }

  clear() {
    Object.values(this.listeners).forEach((set) => set?.clear());
  }
}
