import { describe, expect, it, vi } from "vitest";
import { VoiceSocketClient } from "./voiceSocketClient";
import type { VoiceSocketClientOptions } from "../types";

class MockWebSocket extends EventTarget {
  static OPEN = 1;
  static CLOSED = 3;
  readyState = 0;
  binaryType: BinaryType = "blob";
  sent: any[] = [];
  onopen: ((this: WebSocket, ev: Event) => any) | null = null;
  onmessage: ((this: WebSocket, ev: MessageEvent) => any) | null = null;
  onclose: ((this: WebSocket, ev: CloseEvent) => any) | null = null;
  onerror: ((this: WebSocket, ev: Event) => any) | null = null;

  constructor(public url: string) {
    super();
    // simulate async open
    queueMicrotask(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.call(this as any, new Event("open"));
    });
  }

  send(data: any) {
    this.sent.push(data);
  }

  close(code?: number, reason?: string) {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.call(
      this as any,
      new CloseEvent("close", { code, reason })
    );
  }
}

const createClient = (options: Partial<VoiceSocketClientOptions> = {}) =>
  new VoiceSocketClient({
    url: "wss://example.com",
    WebSocketImpl: MockWebSocket as any,
    ...options
  });

describe("VoiceSocketClient", () => {
  it("connects and sends JSON payloads", async () => {
    const client = createClient();
    await client.sendJson({ type: "ping" });

    const socket = (client as any).socket as MockWebSocket;
    expect(socket.sent).toHaveLength(1);
    expect(JSON.parse(socket.sent[0])).toEqual({ type: "ping" });
  });

  it("notifies listeners", async () => {
    const client = createClient();
    const listener = vi.fn();
    client.subscribe(listener);

    await client.ensureConnection();

    const socket = (client as any).socket as MockWebSocket;
    socket.onmessage?.({
      data: JSON.stringify({ type: "ready" })
    } as MessageEvent);

    expect(listener).toHaveBeenCalledWith({ type: "ready" });
  });
});
