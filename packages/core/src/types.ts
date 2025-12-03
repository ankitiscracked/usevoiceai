export type SpeechEndDetectionMode = "manual" | "auto";

export interface SpeechEndDetectionConfig {
  mode?: SpeechEndDetectionMode;
  provider?: string;
  options?: Record<string, unknown>;
}

export interface SpeechStartHint {
  timestampMs?: number;
  reason?: string;
  providerPayload?: unknown;
}

export type VoiceCommandStage =
  | "idle"
  | "recording"
  | "processing"
  | "completed"
  | "error";

export type VoiceErrorCode =
  | "SOCKET_UNAVAILABLE"
  | "WS_URL_MISSING"
  | "INVALID_PAYLOAD"
  | "COMMAND_IN_PROGRESS"
  | "NO_ACTIVE_COMMAND"
  | "TRANSCRIPTION_FAILED"
  | "AUDIO_FORWARD_FAILED"
  | "AGENT_FAILED"
  | "TTS_FAILED"
  | "FINALIZE_FAILED"
  | "RECORDER_START_FAILED"
  | "UNKNOWN";

export interface VoiceError {
  code: VoiceErrorCode;
  message: string;
  retryable?: boolean;
  details?: Record<string, unknown>;
  // Legacy compatibility for older clients inspecting `error`.
  error?: string;
}

export interface VoiceCommandStatus {
  stage: VoiceCommandStage;
  transcript?: string | null;
  error?: string;
  errorCode?: VoiceErrorCode;
  startedAt?: number;
}

export interface VoiceInputResult {
  timestamp: number;
  data?: Record<string, unknown> & { responseText?: string };
  error?: string;
}

export type VoiceSocketEvent =
  | { type: "session.ready"; data?: Record<string, unknown> }
  | { type: "session.started" }
  | { type: "transcript.partial"; data?: { transcript?: string } }
  | { type: "transcript.final"; data?: { transcript?: string } }
  | { type: "agent.message"; data?: { message?: string } }
  | {
      type: "session.completed";
      data?: Record<string, unknown> & { responseText?: string };
    }
  | { type: "session.cancelled" }
  | { type: "tts.start"; data?: Record<string, unknown> }
  | { type: "tts.end"; data?: { errored?: boolean } }
  | { type: "session.timeout"; data?: Record<string, unknown> }
  | { type: "session.error"; data?: VoiceError }
  | { type: "session.closed"; data?: { code?: number; reason?: string } }
  | { type: "session.pong"; data?: { timestamp?: number } }
  | { type: "speech.end.hint"; data?: { reason?: string; confidence?: number } }
  | { type: "speech.start.hint"; data?: { reason?: string; timestampMs?: number } }
  | { type: string; data?: any };

export interface VoiceSocketClientOptions {
  /**
   * Static websocket URL. Provide either `url` or `buildUrl`.
   */
  url?: string;
  /**
   * Lazily build the websocket URL (useful when it depends on auth tokens).
   */
  buildUrl?: () => string | Promise<string>;
  /**
   * Idle timeout after which the socket will be closed automatically.
   * Defaults to 5 minutes.
   */
  idleTimeoutMs?: number;
  /**
   * Interval used to send ping frames to keep the connection alive.
   * Defaults to 60 seconds.
   */
  pingIntervalMs?: number;
  /**
   * Provide a custom WebSocket implementation (for SSR/unit tests).
   * Defaults to `globalThis.WebSocket`.
   */
  WebSocketImpl?: typeof WebSocket;
}

export interface RecorderHooks {
  onSocketReady: () => Promise<void> | void;
  onRecordingEnded: () => Promise<void> | void;
  onCancel: () => Promise<void> | void;
}

export interface RecorderOptions extends RecorderHooks {
  /**
   * Optional MediaDevices reference (used for SSR-friendly unit tests).
   */
  mediaDevices?: MediaDevices;
  /**
   * Configure how the recorder should treat speech end events.
   */
  speechEndDetection?: SpeechEndDetectionConfig;
  /**
   * Recorder chunk duration in ms.
   */
  chunkMs?: number;
  /**
   * Callback to send binary chunks (typically to VoiceSocketClient).
   */
  sendBinary: (chunk: ArrayBuffer | Blob) => Promise<void> | void;
  /**
   * Callback to send JSON payloads (start/end/cancel control messages).
   */
  sendJson: (payload: Record<string, unknown>) => Promise<void> | void;
}
