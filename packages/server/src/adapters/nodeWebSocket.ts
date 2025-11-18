import type { IncomingMessage } from "http";
import type { WebSocket, WebSocketServer } from "ws";
import { VoiceSession } from "../session/voiceSession";
import type {
  AgentProcessor,
  SpeechProvider,
  TranscriptionProvider,
} from "../types";

export interface NodeWsSocket {
  readyState: number;
  send: (data: string | ArrayBuffer | Buffer) => void;
  close: (code?: number, reason?: string) => void;
  on: (
    event: "message" | "close" | "error",
    handler: (...args: any[]) => void
  ) => void;
  once?: (
    event: "close" | "error",
    handler: (...args: any[]) => void
  ) => void;
}

export interface NodeWsSessionOptions {
  ws: NodeWsSocket;
  userId: string;
  transcriptionProvider: TranscriptionProvider;
  agentProcessor: AgentProcessor;
  speechProvider: SpeechProvider;
  idleTimeoutMs?: number;
}

export type NodeWebSocketAdapterOptions = NodeWsSessionOptions;

export interface NodeWsContext {
  request: IncomingMessage;
  userId: string;
  socket: NodeWsSocket;
}

export type NodeWebSocketSessionContext = NodeWsContext;

export interface NodeWsProviders {
  transcription: (ctx: NodeWsContext) => TranscriptionProvider;
  agent: (ctx: NodeWsContext) => AgentProcessor;
  speech: (ctx: NodeWsContext) => SpeechProvider;
}

export type NodeWebSocketProviderFactory = NodeWsProviders;

export interface NodeWsServerOptions {
  server: WebSocketServer;
  getUserId: (
    ctx: { request: IncomingMessage }
  ) => string | Promise<string>;
  providers: NodeWsProviders;
  idleTimeoutMs?: number;
  onSessionStart?: (ctx: { userId: string; session: VoiceSession }) => void;
  onSessionEnd?: (ctx: { userId: string }) => void;
  /**
   * Optional message sent to the previous socket when a new session replaces it.
   */
  replacementReason?: string;
  replacementCode?: number;
}

export type NodeWebSocketServerAdapterOptions = NodeWsServerOptions;

const NODE_WS_OPEN_STATE = 1;
const DEFAULT_REPLACEMENT_CODE = 4001;
const DEFAULT_REPLACEMENT_REASON = "voice session replaced";

type ManagedSession = {
  session: VoiceSession;
  socket: NodeWsSocket;
};

const managedSessions = new Map<string, ManagedSession>();

export function attachNodeWsSession({
  ws,
  userId,
  transcriptionProvider,
  agentProcessor,
  speechProvider,
  idleTimeoutMs,
}: NodeWsSessionOptions) {
  closeManagedSession(userId, DEFAULT_REPLACEMENT_CODE, undefined);

  const manager = new VoiceSession({
    userId,
    transcriptionProvider,
    agentProcessor,
    speechProvider,
    idleTimeoutMs,
    sendJson: (payload) => {
      if (ws.readyState === NODE_WS_OPEN_STATE) {
        ws.send(JSON.stringify(payload));
      }
    },
    sendBinary: (chunk) => {
      if (ws.readyState === NODE_WS_OPEN_STATE) {
        ws.send(chunk);
      }
    },
    closeSocket: (code, reason) => {
      ws.close(code, reason);
    },
  });

  managedSessions.set(userId, { session: manager, socket: ws });

  manager.handleOpen();

  ws.on("message", (data: Buffer | ArrayBuffer | Buffer[] | string) => {
    if (typeof data === "string") {
      manager.handleMessage(data);
      return;
    }
    if (data instanceof ArrayBuffer) {
      manager.handleMessage(data);
      return;
    }
    if (Array.isArray(data)) {
      const merged = Buffer.concat(data);
      manager.handleMessage(bufferToArrayBuffer(merged));
      return;
    }
    manager.handleMessage(bufferToArrayBuffer(data));
  });

  ws.on("close", (code: number, reason: Buffer) => {
    manager.handleClose(code, reason?.toString());
    cleanupManagedSession(userId, manager);
  });

  ws.on("error", (error: Error) => {
    manager.handleClose(1011, error.message);
    cleanupManagedSession(userId, manager);
  });

  return manager;
}

export const attachNodeWebSocketSession = attachNodeWsSession;

export function getNodeWsSession(userId: string) {
  return managedSessions.get(userId)?.session ?? null;
}

export const getActiveNodeWebSocketSession = getNodeWsSession;

export function disconnectNodeWsSession(
  userId: string,
  code?: number,
  reason?: string
) {
  return closeManagedSession(userId, code, reason);
}

export const disconnectNodeWebSocketSession = disconnectNodeWsSession;

export function registerNodeWsServer({
  server,
  getUserId,
  providers,
  idleTimeoutMs,
  onSessionStart,
  onSessionEnd,
  replacementReason = DEFAULT_REPLACEMENT_REASON,
  replacementCode = DEFAULT_REPLACEMENT_CODE,
}: NodeWsServerOptions) {
  const handler = async (socket: WebSocket, request: IncomingMessage) => {
    let userId: string;
    try {
      userId = await Promise.resolve(getUserId({ request }));
    } catch (error) {
      socket.close(
        4401,
        formatReason(error, "unauthorized voice session request")
      );
      return;
    }

    if (!userId) {
      socket.close(4401, "missing voice session context");
      return;
    }

    const context: NodeWsContext = {
      request,
      userId,
      socket: socket as unknown as NodeWsSocket,
    };

    let transcription: TranscriptionProvider;
    let agent: AgentProcessor;
    let speech: SpeechProvider;

    try {
      transcription = providers.transcription(context);
      agent = providers.agent(context);
      speech = providers.speech(context);
    } catch (error) {
      socket.close(1011, formatReason(error, "failed to initialize session"));
      return;
    }

    closeManagedSession(userId, replacementCode, replacementReason);

    const session = attachNodeWsSession({
      ws: socket as unknown as NodeWsSocket,
      userId,
      transcriptionProvider: transcription,
      agentProcessor: agent,
      speechProvider: speech,
      idleTimeoutMs,
    });

    onSessionStart?.({ userId, session });

    const notifyEnd = () => onSessionEnd?.({ userId });
    if (typeof socket.once === "function") {
      socket.once("close", notifyEnd);
      socket.once("error", notifyEnd);
    } else {
      socket.on("close", notifyEnd);
      socket.on("error", notifyEnd);
    }
  };

  server.on("connection", (socket, request) => {
    void handler(socket, request);
  });

  return {
    closeSession: (userId: string, code?: number, reason?: string) =>
      disconnectNodeWebSocketSession(userId, code, reason),
    getSession: (userId: string) => managedSessions.get(userId)?.session ?? null,
    activeSessionCount: () => managedSessions.size,
  };
}

export const registerNodeWebSocketServer = registerNodeWsServer;

function cleanupManagedSession(userId: string, session: VoiceSession) {
  const existing = managedSessions.get(userId);
  if (existing?.session !== session) {
    return;
  }
  managedSessions.delete(userId);
}

function closeManagedSession(
  userId: string,
  code = DEFAULT_REPLACEMENT_CODE,
  reason = DEFAULT_REPLACEMENT_REASON
) {
  const existing = managedSessions.get(userId);
  if (!existing) {
    return false;
  }
  managedSessions.delete(userId);
  try {
    existing.socket.close(code, reason);
  } catch (error) {
    console.error("Failed to close websocket session", error);
  }
  return true;
}

function bufferToArrayBuffer(buffer: Buffer) {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  );
}

function formatReason(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}
