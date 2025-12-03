import type {
  AgentProcessor,
  SpeechEndHint,
  SpeechProvider,
  TranscriptionProvider,
  TranscriptStream,
  VoiceSessionOptions,
} from "../types";
import type {
  SpeechEndDetectionConfig,
  VoiceErrorCode,
  VoiceSocketEvent,
} from "@usevoiceai/core";

type ClientPayload =
  | {
      type: "start";
      audio?: AudioConfig;
      speechEndDetection?: SpeechEndDetectionConfig;
    }
  | { type: "end" }
  | { type: "cancel" }
  | { type: "ping"; timestamp?: number };

type AudioConfig = {
  encoding?: string;
  sampleRate?: number;
  channels?: number;
};

type NormalizedSpeechEndDetectionConfig = SpeechEndDetectionConfig & {
  mode: "manual" | "auto";
};

type ActiveCommand = {
  id: number;
  transcriber: TranscriptStream;
  finalTranscriptChunks: string[];
  startedAt: number;
  speechEndDetection: NormalizedSpeechEndDetectionConfig;
  completionRequested: boolean;
  acceptingAudio: boolean;
  speechEndHintDispatched: boolean;
  mode: "manual" | "auto";
  activeTurnId: number | null;
  turnCounter: number;
  pendingTurns: Array<{ id: number; skipResponse: boolean }>;
};

const FIVE_MINUTES_IN_MS = 5 * 60 * 1000;
const DEFAULT_SPEECH_END_DETECTION: NormalizedSpeechEndDetectionConfig = {
  mode: "manual",
};
type TtsState = {
  streaming: boolean;
  interrupted: boolean;
  endSent: boolean;
};

export class VoiceSession {
  private transcriptionProvider: TranscriptionProvider;
  private agentProcessor: AgentProcessor;
  private speechProvider: SpeechProvider;
  private inactivityTimer: ReturnType<typeof setTimeout> | null = null;
  private lastActivity = Date.now();
  private activeCommand: ActiveCommand | null = null;
  private nextCommandId = 1;
  private ttsState: TtsState = {
    streaming: false,
    interrupted: false,
    endSent: false,
  };

  constructor(private options: VoiceSessionOptions) {
    this.transcriptionProvider = options.transcriptionProvider;
    this.agentProcessor = options.agentProcessor;
    this.speechProvider = options.speechProvider;
  }

  handleOpen() {
    this.touch();
    this.options.sendJson({
      type: "session.ready",
      data: {
        timeoutMs: this.options.idleTimeoutMs ?? FIVE_MINUTES_IN_MS,
      },
    });
  }

  async handleMessage(message: string | ArrayBuffer | Blob) {
    this.touch();
    if (typeof message === "string") {
      await this.handleJson(message);
      return;
    }

    if (message instanceof Blob) {
      await this.forwardAudioChunk(await message.arrayBuffer());
      return;
    }

    await this.forwardAudioChunk(message);
  }

  handleClose(code?: number, reason?: string) {
    this.clearInactivityTimer();
    this.teardownActiveCommand(
      reason ?? `socket closed (${code ?? "unknown"})`
    );
  }

  private async handleJson(raw: string) {
    let payload: ClientPayload;
    try {
      payload = JSON.parse(raw) as ClientPayload;
    } catch {
      this.sendError("INVALID_PAYLOAD", "Invalid JSON payload");
      return;
    }

    switch (payload.type) {
      case "start":
        await this.startCommand(payload);
        break;
      case "end":
        await this.completeCommand("manual");
        break;
      case "cancel":
        this.cancelCommand();
        break;
      case "ping":
        this.options.sendJson({
          type: "session.pong",
          data: { timestamp: payload.timestamp ?? Date.now() },
        });
        break;
      default:
        this.sendError(
          "INVALID_PAYLOAD",
          `Unsupported event type ${(payload as any).type}`
        );
    }
  }

  private async startCommand(
    payload: Extract<ClientPayload, { type: "start" }>
  ) {
    if (this.activeCommand) {
      this.sendError("COMMAND_IN_PROGRESS", "A command is already in progress");
      return;
    }

    try {
      const speechEndDetection = this.normalizeSpeechEndDetection(
        payload.speechEndDetection
      );
      const transcriber = await this.transcriptionProvider.createStream({
        encoding: payload.audio?.encoding,
        sampleRate: payload.audio?.sampleRate,
        channels: payload.audio?.channels,
        speechEndDetection,
        onTranscript: (event) => this.handleTranscript(event),
        onError: (error) => this.handleTranscriptionError(error),
        onSpeechEnd: (hint) => this.handleSpeechEndHint(hint),
      });

      this.activeCommand = {
        id: this.nextCommandId++,
        transcriber,
        finalTranscriptChunks: [],
        startedAt: Date.now(),
        speechEndDetection,
        completionRequested: false,
        acceptingAudio: true,
        speechEndHintDispatched: false,
        mode: speechEndDetection.mode,
        activeTurnId: null,
        turnCounter: 0,
        pendingTurns: [],
      };

      this.options.sendJson({ type: "session.started" });
    } catch (error) {
      this.sendError(
        "TRANSCRIPTION_FAILED",
        error instanceof Error
          ? error.message
          : "Failed to start transcription stream"
      );
    }
  }

  private async completeCommand(trigger: "manual" | "auto" = "manual") {
    const command = this.activeCommand;
    if (!command) {
      this.sendError("NO_ACTIVE_COMMAND", "No active command");
      return;
    }

    if (command.completionRequested) {
      return;
    }

    command.completionRequested = true;
    command.acceptingAudio = false;

    try {
      await command.transcriber.finish();
      const finalTranscript = command.finalTranscriptChunks.join(" ").trim();
      if (finalTranscript.length > 0) {
        await this.processTranscript(command, finalTranscript);
      }
      this.teardownActiveCommand("command complete");
    } catch (error) {
      this.sendError(
        "FINALIZE_FAILED",
        error instanceof Error ? error.message : "Failed to finalize command"
      );
      this.teardownActiveCommand("finalization failed");
    }
  }

  private cancelCommand() {
    if (!this.activeCommand) {
      return;
    }
    this.activeCommand.acceptingAudio = false;
    this.activeCommand.transcriber.abort("command cancelled");
    this.activeCommand = null;
    this.options.sendJson({ type: "session.cancelled" });
  }

  private async forwardAudioChunk(buffer: ArrayBuffer) {
    if (!this.activeCommand || !this.activeCommand.acceptingAudio) {
      return;
    }

    try {
      this.activeCommand.transcriber.send(buffer);
    } catch (error) {
      this.sendError(
        "AUDIO_FORWARD_FAILED",
        error instanceof Error ? error.message : "Failed to forward audio chunk"
      );
    }
  }

  private async processTranscript(
    command: ActiveCommand,
    transcript: string
  ): Promise<void> {
    const turnId = ++command.turnCounter;
    command.activeTurnId = turnId;
    const turnState = { id: turnId, skipResponse: false };
    command.pendingTurns.push(turnState);
    this.options.sendJson({
      type: "transcript.final",
      data: { transcript },
    });

    try {
      const result = await this.agentProcessor.process({
        transcript,
        userId: this.options.userId,
        excludeFromConversation: () => turnState.skipResponse,
        send: (event: VoiceSocketEvent) => this.forwardAgentEvent(event),
      });

      if (result === undefined || result === null) {
        throw new Error("Agent returned no responseText");
      }

      const completeData =
        typeof result === "string"
          ? { responseText: result }
          : result && typeof result === "object"
          ? result
          : null;

      const responseText =
        (completeData as any)?.responseText ??
        (completeData as any)?.formattedContent?.content;

      if (
        !completeData ||
        typeof responseText !== "string" ||
        responseText.trim().length === 0
      ) {
        throw new Error("Agent responseText is required");
      }

      await this.forwardAgentEvent(
        { type: "session.completed", data: completeData },
        { allowComplete: true }
      );
    } catch (error) {
      this.sendError(
        "AGENT_FAILED",
        error instanceof Error ? error.message : "Agentic processing failed"
      );
    } finally {
      if (this.activeCommand && this.activeCommand.id === command.id) {
        this.activeCommand.activeTurnId = null;
      }
    }
  }

  private async forwardAgentEvent(
    event: VoiceSocketEvent,
    options?: { allowComplete?: boolean }
  ) {
    if (event.type === "session.completed" && !options?.allowComplete) {
      return;
    }

    if (event.type === "session.completed" && this.activeCommand) {
      const turnState = this.activeCommand.pendingTurns.shift();
      if (turnState?.skipResponse) {
        return;
      }
      if (turnState) {
      }
    }

    this.options.sendJson(event);

    if (event.type !== "session.completed") {
      return;
    }

    const text =
      event.data?.responseText ?? event.data?.formattedContent?.content;
    if (!text) {
      return;
    }

    if (!this.speechProvider) {
      return;
    }

    this.options.sendJson({
      type: "tts.start",
      data: {
        encoding: "linear16",
        sampleRate: 48000,
        mimeType: "audio/raw",
      },
    });

    this.ttsState = { streaming: true, interrupted: false, endSent: false };
    let handled = false;
    try {
      await this.speechProvider.send(text, {
        onAudioChunk: (chunk) => {
          if (this.ttsState.endSent) {
            return;
          }
          this.options.sendBinary(chunk);
        },
        onClose: () => {
          this.endTtsStream();
        },
        onError: (error) => {
          handled = true;
          this.sendError("TTS_FAILED", error.message);
          this.endTtsStream({ errored: true });
        },
      });
    } catch (error) {
      if (!handled) {
        const message =
          error instanceof Error ? error.message : "Failed to stream TTS audio";
        this.sendError("TTS_FAILED", message);
        this.endTtsStream({ errored: true });
      }
    } finally {
      this.ttsState = { streaming: false, interrupted: false, endSent: false };
    }
  }

  private handleTranscript(event: { transcript: string; isFinal: boolean }) {
    if (!this.activeCommand) {
      return;
    }

    const trimmed = event.transcript.trim();
    if (
      trimmed.length === 0 &&
      this.activeCommand.finalTranscriptChunks.length === 0
    ) {
      return;
    }

    const combine = (...segments: string[]) =>
      segments
        .map((segment) => segment.trim())
        .filter((segment) => segment.length > 0)
        .join(" ");

    if (event.isFinal) {
      if (trimmed.length === 0) {
        return;
      }

      this.activeCommand.finalTranscriptChunks.push(trimmed);
      const aggregate = combine(...this.activeCommand.finalTranscriptChunks);
      if (aggregate.length > 0) {
        this.options.sendJson({
          type: "transcript.partial",
          data: { transcript: aggregate },
        });
      }
      return;
    }

    const aggregate = combine(
      ...this.activeCommand.finalTranscriptChunks,
      trimmed
    );
    if (aggregate.length === 0) {
      return;
    }

    this.options.sendJson({
      type: "transcript.partial",
      data: { transcript: aggregate },
    });

    if (!event.isFinal && aggregate.length > 0) {
      const activeTurnId = this.activeCommand.activeTurnId;
      if (activeTurnId !== null) {
        const turnStateIndex = this.activeCommand.pendingTurns.findIndex(
          (turn) => turn.id === activeTurnId
        );
        if (turnStateIndex !== -1) {
          this.activeCommand.pendingTurns[turnStateIndex].skipResponse = true;
        }
        this.activeCommand.activeTurnId = null;
      }
    }

    if (
      !event.isFinal &&
      trimmed.length > 0 &&
      this.ttsState.streaming &&
      !this.ttsState.endSent
    ) {
      this.ttsState.interrupted = true;
      this.endTtsStream({ interrupted: true });
      this.ttsState.streaming = false;
    }
  }

  private handleTranscriptionError(error: Error) {
    this.sendError("TRANSCRIPTION_FAILED", error.message);
    this.teardownActiveCommand("transcriber error");
  }

  private async finalizeAutoTurn(command: ActiveCommand) {
    const transcript = command.finalTranscriptChunks.join(" ").trim();
    command.finalTranscriptChunks = [];

    if (transcript.length === 0) {
      command.speechEndHintDispatched = false;
      return;
    }

    try {
      await this.processTranscript(command, transcript);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to process auto voice command";
      this.sendError("AGENT_FAILED", message);
    } finally {
      if (this.activeCommand && this.activeCommand.id === command.id) {
        this.activeCommand.speechEndHintDispatched = false;
      }
    }
  }

  private teardownActiveCommand(reason: string) {
    if (!this.activeCommand) {
      return;
    }

    try {
      this.activeCommand.acceptingAudio = false;
      this.activeCommand.transcriber.abort(reason);
    } catch {
      console.error("Failed to abort transcription stream", reason);
      this.sendError(
        "TRANSCRIPTION_FAILED",
        `Failed to abort transcription stream: ${reason}`
      );
      // ignore
    }
    this.activeCommand = null;
  }

  private sendError(
    code: VoiceErrorCode,
    message: string,
    extra?: { retryable?: boolean; details?: Record<string, unknown> }
  ) {
    this.options.sendJson({
      type: "session.error",
      data: {
        code,
        message,
        error: message,
        ...(extra?.retryable ? { retryable: true } : {}),
        ...(extra?.details ? { details: extra.details } : {}),
      },
    });
  }

  private endTtsStream(extra?: { errored?: boolean; interrupted?: boolean }) {
    if (!this.ttsState.streaming || this.ttsState.endSent) {
      return;
    }
    const data: Record<string, unknown> = {};
    if (extra?.errored) {
      data.errored = true;
    }
    if (extra?.interrupted) {
      data.interrupted = true;
    } else if (this.ttsState.interrupted) {
      data.interrupted = true;
    }
    this.ttsState.endSent = true;
    this.options.sendJson({
      type: "tts.end",
      data: Object.keys(data).length > 0 ? data : undefined,
    });
  }

  private touch() {
    this.lastActivity = Date.now();
    this.scheduleInactivityTimer();
  }

  private scheduleInactivityTimer() {
    if (typeof setTimeout !== "function") {
      return;
    }

    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
    }

    const timeout = this.options.idleTimeoutMs ?? FIVE_MINUTES_IN_MS;
    this.inactivityTimer = setTimeout(() => {
      const idleTime = Date.now() - this.lastActivity;
      if (idleTime >= timeout) {
        this.options.sendJson({
          type: "session.timeout",
          data: { idleMs: idleTime },
        });
        this.options.closeSocket(4000, "idle timeout");
      } else {
        this.scheduleInactivityTimer();
      }
    }, timeout);
  }

  private clearInactivityTimer() {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }
  }

  private normalizeSpeechEndDetection(
    config?: SpeechEndDetectionConfig
  ): NormalizedSpeechEndDetectionConfig {
    if (!config) {
      return { ...DEFAULT_SPEECH_END_DETECTION };
    }
    const mode = config.mode === "auto" ? "auto" : "manual";
    return { ...config, mode };
  }

  private handleSpeechEndHint(hint?: SpeechEndHint) {
    if (!this.activeCommand) {
      return;
    }

    this.options.sendJson({
      type: "speech.end.hint",
      data: {
        reason: hint?.reason,
        confidence: hint?.confidence,
      },
    });

    if (this.activeCommand.speechEndDetection.mode !== "auto") {
      if (this.activeCommand.speechEndHintDispatched) {
        return;
      }
      this.activeCommand.speechEndHintDispatched = true;
      this.activeCommand.acceptingAudio = false;
      this.completeCommand("auto").catch((error) => {
        const message =
          error instanceof Error ? error.message : "Failed to auto-complete";
        this.sendError("FINALIZE_FAILED", message);
      });
      return;
    }

    void this.finalizeAutoTurn(this.activeCommand);
  }
}
