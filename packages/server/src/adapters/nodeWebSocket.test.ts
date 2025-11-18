import { describe, expect, it, vi } from "vitest";
import {
  attachNodeWsSession,
  disconnectNodeWsSession,
  getNodeWsSession,
  registerNodeWsServer,
} from "./nodeWebSocket";
import {
  MockAgentProcessor,
  MockTranscriptionProvider,
} from "../mockProviders";
import { MockSpeechProvider } from "../mockProviders/speech/mockSpeechProvider";
import type { IncomingMessage } from "http";
import type { WebSocketServer } from "ws";

class FakeWebSocket {
  readyState = 1;
  sent: any[] = [];
  handlers: Record<string, ((...args: any[]) => void)[]> = {};

  send(data: any) {
    this.sent.push(data);
  }

  close() {
    this.readyState = 3;
  }

  on(event: string, handler: (...args: any[]) => void) {
    if (!this.handlers[event]) {
      this.handlers[event] = [];
    }
    this.handlers[event].push(handler);
  }

  emit(event: string, ...args: any[]) {
    this.handlers[event]?.forEach((handler) => handler(...args));
  }
}

class FakeWsServer {
  private connectionHandler: ((ws: FakeWebSocket, req: IncomingMessage) => void) | null =
    null;

  on(event: string, handler: any) {
    if (event === "connection") {
      this.connectionHandler = handler;
    }
  }

  simulateConnection(ws: FakeWebSocket, req: IncomingMessage) {
    if (!this.connectionHandler) {
      throw new Error("no connection handler registered");
    }
    this.connectionHandler(ws, req);
  }
}

describe("attachNodeWsSession", () => {
  it("wires websocket events to session manager", async () => {
    const ws = new FakeWebSocket();
    attachNodeWsSession({
      ws: ws as any,
      userId: "user-1",
      transcriptionProvider: new MockTranscriptionProvider({
        transcript: "hello",
      }),
      agentProcessor: new MockAgentProcessor(),
      speechProvider: new MockSpeechProvider(),
    });

    ws.emit("message", JSON.stringify({ type: "start" }));
    await Promise.resolve();
    ws.emit("message", JSON.stringify({ type: "end" }));

    // Should have sent at least ready + command events
    expect(ws.sent.some((payload) => payload.includes("ready"))).toBe(true);
  });

  it("replaces an existing session for the same user", () => {
    const first = new FakeWebSocket();
    const second = new FakeWebSocket();

    const sessionA = attachNodeWsSession({
      ws: first as any,
      userId: "user-1",
      transcriptionProvider: new MockTranscriptionProvider({
        transcript: "first",
      }),
      agentProcessor: new MockAgentProcessor(),
      speechProvider: new MockSpeechProvider(),
    });
    expect(getNodeWsSession("user-1")).toBe(sessionA);

    const sessionB = attachNodeWsSession({
      ws: second as any,
      userId: "user-1",
      transcriptionProvider: new MockTranscriptionProvider({
        transcript: "second",
      }),
      agentProcessor: new MockAgentProcessor(),
      speechProvider: new MockSpeechProvider(),
    });

    expect(first.readyState).toBe(3);
    expect(getNodeWsSession("user-1")).toBe(sessionB);
  });

  it("allows manually disconnecting a user", () => {
    const ws = new FakeWebSocket();
    attachNodeWsSession({
      ws: ws as any,
      userId: "user-99",
      transcriptionProvider: new MockTranscriptionProvider({
        transcript: "bye",
      }),
      agentProcessor: new MockAgentProcessor(),
      speechProvider: new MockSpeechProvider(),
    });

    expect(disconnectNodeWsSession("user-99")).toBe(true);
    expect(ws.readyState).toBe(3);
    expect(getNodeWsSession("user-99")).toBeNull();
  });
});

describe("registerNodeWsServer", () => {
  it("creates sessions when the ws server emits a connection event", async () => {
    const server = new FakeWsServer();

    const onSessionStart = vi.fn();
    registerNodeWsServer({
      server: server as unknown as WebSocketServer,
      getUserId: () => "server-user",
      providers: {
        transcription: () =>
          new MockTranscriptionProvider({ transcript: "hello" }),
        agent: () => new MockAgentProcessor(),
        speech: () => new MockSpeechProvider(),
      },
      onSessionStart,
    });

    const socket = new FakeWebSocket();
    server.simulateConnection(
      socket,
      { headers: {} } as IncomingMessage
    );

    await Promise.resolve();

    expect(onSessionStart).toHaveBeenCalled();
    const session = getNodeWsSession("server-user");
    expect(session).not.toBeNull();
  });
});
