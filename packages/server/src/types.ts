import type {
  SpeechEndDetectionConfig,
  SpeechStartHint,
  VoiceSocketEvent,
} from "@usevoiceai/core";

export type {
  SpeechEndDetectionConfig,
  SpeechStartHint,
} from "@usevoiceai/core";

export interface Env {
  [key: string]: any;
}

export interface VoiceCommandContext {
  userId: string;
  transcript: string;
}

export type TranscriptEvent =
  | { type: "transcript"; transcript: string; isFinal: boolean }
  | { type: "speech-end"; hint?: SpeechEndHint }
  | { type: "speech-start"; hint?: SpeechStartHint };

export interface TranscriptStream extends AsyncIterable<TranscriptEvent> {
  send: (chunk: ArrayBuffer | ArrayBufferView) => void;
  finish: () => Promise<void>;
  abort: (reason?: string) => void;
}

export interface SpeechEndHint {
  reason?: string;
  confidence?: number;
  providerPayload?: unknown;
}

export interface TranscriptionProvider {
  createStream: (options: {
    encoding?: string;
    sampleRate?: number;
    channels?: number;
    onTranscript: (event: { transcript: string; isFinal: boolean }) => void;
    onError: (error: Error) => void;
    onClose?: () => void;
    onSpeechEnd?: (hint?: SpeechEndHint) => void;
    onSpeechStart?: (hint?: SpeechStartHint) => void;
    speechEndDetection?: SpeechEndDetectionConfig;
  }) => Promise<TranscriptStream>;
}

export interface AgentProcessor {
  process: (options: {
    transcript: string;
    userId: string;
    excludeFromConversation?: () => boolean;
    send: (event: VoiceSocketEvent) => void | Promise<void>;
  }) => Promise<string | { responseText: string; [key: string]: any }>;
}

export interface SpeechProvider {
  send: (
    text: string,
    handlers: {
      onAudioChunk: (chunk: ArrayBuffer) => void;
      onClose: () => void;
      onError: (error: Error) => void;
    }
  ) => Promise<SpeechStream>;
}

export interface SpeechStream extends AsyncIterable<ArrayBuffer> {
  cancel?: (reason?: string) => void;
}

export interface VoiceSessionOptions {
  userId: string;
  transcriptionProvider: TranscriptionProvider;
  agentProcessor: AgentProcessor;
  speechProvider: SpeechProvider;
  idleTimeoutMs?: number;
  sendJson: (payload: VoiceSocketEvent) => void;
  sendBinary: (chunk: ArrayBuffer) => void;
  closeSocket: (code?: number, reason?: string) => void;
}
