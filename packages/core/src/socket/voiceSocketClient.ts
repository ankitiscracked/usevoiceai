import type {
  VoiceSocketClientOptions,
  VoiceSocketEvent
} from "../types";
import { SimpleEventEmitter } from "../utils/eventEmitter";

type SocketEvents = {
  message: VoiceSocketEvent;
  binary: ArrayBuffer;
  error: Error;
  close: { code?: number; reason?: string };
  state: ConnectionState;
};

type ConnectionState = "idle" | "connecting" | "open" | "closing" | "closed";

export class VoiceSocketClient {
  private options: Required<
    Pick<VoiceSocketClientOptions, "idleTimeoutMs" | "pingIntervalMs">
  > & VoiceSocketClientOptions;

  private socket: WebSocket | null = null;
  private state: ConnectionState = "idle";

  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  private emitter = new SimpleEventEmitter<SocketEvents>();
  private listeners = new Set<
    (event: VoiceSocketEvent | ArrayBuffer) => void
  >();

  constructor(options: VoiceSocketClientOptions = {}) {
    this.options = {
      idleTimeoutMs: options.idleTimeoutMs ?? 5 * 60 * 1000,
      pingIntervalMs: options.pingIntervalMs ?? 60_000,
      ...options
    };
  }

  get connectionState() {
    return this.state;
  }

  onMessage(handler: (event: VoiceSocketEvent) => void) {
    return this.emitter.on("message", handler);
  }

  onBinary(handler: (chunk: ArrayBuffer) => void) {
    return this.emitter.on("binary", handler);
  }

  subscribe(handler: (event: VoiceSocketEvent | ArrayBuffer) => void) {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }

  async ensureConnection() {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.scheduleIdleClose();
      return this.socket;
    }

    if (!this.options.WebSocketImpl && typeof WebSocket === "undefined") {
      throw new Error("No WebSocket implementation available");
    }

    const WebSocketImpl = this.options.WebSocketImpl ?? WebSocket;
    const url = this.options.url ?? (await this.options.buildUrl?.());
    if (!url) {
      throw new Error("Unable to resolve websocket url");
    }

    this.updateState("connecting");

    const ws = new WebSocketImpl(url);
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      this.socket = ws;
      this.updateState("open");
      this.scheduleIdleClose();
      this.setupPing(ws);
    };

    ws.onmessage = (event: MessageEvent) => {
      this.scheduleIdleClose();
      const data = event.data;
      if (typeof data === "string") {
        try {
          const parsed = JSON.parse(data) as VoiceSocketEvent;
          this.emitter.emit("message", parsed);
          this.listeners.forEach((listener) => listener(parsed));
        } catch (error) {
          this.emitter.emit(
            "error",
            error instanceof Error ? error : new Error("Invalid JSON")
          );
        }
      } else if (data instanceof ArrayBuffer) {
        this.emitter.emit("binary", data);
        this.listeners.forEach((listener) => listener(data));
      } else if (data instanceof Blob) {
        data.arrayBuffer().then((buffer) => {
          this.emitter.emit("binary", buffer);
          this.listeners.forEach((listener) => listener(buffer));
        });
      }
    };

    ws.onerror = (event: Event) => {
      const error =
        "error" in event ? (event as ErrorEvent).error : new Error("Socket error");
      this.emitter.emit(
        "error",
        error instanceof Error ? error : new Error(String(error))
      );
    };

    ws.onclose = (event: CloseEvent) => {
      this.cleanupSocket();
      this.emitter.emit("close", {
        code: event.code,
        reason: event.reason
      });
      this.listeners.forEach((listener) =>
        listener({
          type: "closed",
          data: { code: event.code, reason: event.reason }
        })
      );
    };

    return ws;
  }

  async sendJson(payload: Record<string, unknown>) {
    const socket = await this.ensureConnection();
    socket.send(JSON.stringify(payload));
    this.scheduleIdleClose();
  }

  async sendBinary(chunk: ArrayBuffer | Blob) {
    const socket = await this.ensureConnection();
    if (chunk instanceof Blob) {
      socket.send(await chunk.arrayBuffer());
    } else {
      socket.send(chunk);
    }
    this.scheduleIdleClose();
  }

  close(code = 1000, reason = "client closed connection") {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.updateState("closing");
      this.socket.close(code, reason);
    } else {
      this.cleanupSocket();
    }
  }

  private setupPing(socket: WebSocket) {
    this.clearPingTimer();
    this.pingTimer = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({ type: "ping", timestamp: Date.now() })
        );
      }
    }, this.options.pingIntervalMs);
  }

  private scheduleIdleClose() {
    if (typeof setTimeout !== "function") {
      return;
    }

    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }

    this.idleTimer = setTimeout(() => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        return;
      }
      this.updateState("closing");
      this.socket.close(4000, "client idle timeout");
    }, this.options.idleTimeoutMs);
  }

  private cleanupSocket() {
    this.clearIdleTimer();
    this.clearPingTimer();
    if (this.socket) {
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onclose = null;
      this.socket.onerror = null;
    }
    this.socket = null;
    this.updateState("closed");
  }

  private clearIdleTimer() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  private clearPingTimer() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private updateState(next: ConnectionState) {
    this.state = next;
    this.emitter.emit("state", next);
  }
}
