import { VoiceRecorderController } from "../recorder/voiceRecorderController";
import { VoiceSocketClient } from "../socket/voiceSocketClient";
import { VoiceCommandStateStore } from "../state/voiceCommandState";
import { VoiceAudioStream } from "../audio/voiceAudioStream";
import type {
  VoiceCommandResult,
  VoiceSocketEvent
} from "../types";

export interface VoiceCommandControllerOptions {
  socket: VoiceSocketClient;
  state?: VoiceCommandStateStore;
  notifications?: {
    success?: (message: string) => void;
    error?: (message: string) => void;
  };
  onQueryResponse?: (response: VoiceCommandResult | null) => void;
  mediaDevices?: MediaDevices;
}

const INTENT_SUCCESS_MESSAGES: Record<string, string> = {
  create: "Voice command saved successfully!",
  update: "Voice command updated successfully!",
  delete: "Voice command deleted successfully!"
};

export class VoiceCommandController {
  private state: VoiceCommandStateStore;
  private recorder: VoiceRecorderController;
  private unsubSocket: (() => void) | null = null;
  private queryResponse: VoiceCommandResult | null = null;
  private audioStream: VoiceAudioStream | null = null;

  constructor(private options: VoiceCommandControllerOptions) {
    this.state = options.state ?? new VoiceCommandStateStore();
    this.recorder = new VoiceRecorderController({
      sendBinary: (chunk) => this.options.socket.sendBinary(chunk),
      sendJson: (payload) => this.options.socket.sendJson(payload),
      onSocketReady: () => this.handleSocketReady(),
      onRecordingEnded: () => this.handleRecordingEnded(),
      onCancel: () => this.handleCancel(),
      mediaDevices: this.options.mediaDevices
    });

    this.unsubSocket = this.options.socket.subscribe((event) =>
      this.handleSocketEvent(event)
    );
  }

  getStatus() {
    return this.state.getStatus();
  }

  getResults() {
    return this.state.getResults();
  }

  getQueryResponse() {
    return this.queryResponse;
  }

  getRecorderStream() {
    return this.recorder.stream ?? null;
  }

  async startRecording() {
    this.state.setStatus({
      stage: "recording",
      startedAt: Date.now(),
      error: undefined,
      transcript: undefined,
      realtimeText: "",
      realtimeStatus: "listening"
    });
    try {
      await this.recorder.start();
    } catch (error) {
      this.state.resetStatus();
      throw error;
    }
  }

  stopRecording() {
    this.recorder.stop();
  }

  async cancelRecording() {
    await this.recorder.cancel();
  }

  destroy() {
    this.unsubSocket?.();
    this.state.resetStatus();
    this.closeAudioStream();
    this.state.setAudioPlayback(false);
  }

  private async handleSocketReady() {
    this.queryResponse = null;
    this.closeAudioStream();
    this.state.setAudioPlayback(false);
    this.state.setStatus({
      transcript: undefined,
      realtimeText: "",
      realtimeStatus: "connecting"
    });
    await this.options.socket.ensureConnection();
  }

  private async handleRecordingEnded() {
    this.state.updateStage("transcribing");
    this.state.setStatus({ realtimeStatus: "transcribing" });
  }

  private async handleCancel() {
    this.state.resetStatus();
    this.closeAudioStream();
    this.state.setAudioPlayback(false);
    this.state.setStatus({ realtimeText: "", realtimeStatus: undefined });
  }

  private async handleSocketEvent(event: VoiceSocketEvent | ArrayBuffer) {
    if (event instanceof ArrayBuffer) {
      this.audioStream?.push(event);
      return;
    }

    const { type } = event;
    const data = "data" in event ? event.data : undefined;

    switch (type) {
      case "transcript.partial":
        if (typeof data?.transcript === "string") {
          this.state.setStatus({
            transcript: data.transcript,
            realtimeText: data.transcript,
            realtimeStatus: "partial"
          });
        }
        break;
      case "transcript.final":
        if (typeof data?.transcript === "string") {
          this.state.setStatus({
            transcript: data.transcript,
            realtimeText: data.transcript,
            realtimeStatus: "final"
          });
        }
        break;
      case "tool-message":
        this.state.setStatus({ stage: "processing" });
        break;
      case "complete":
        await this.handleComplete(data);
        break;
      case "command-cancelled":
        this.state.resetStatus();
        this.closeAudioStream();
        this.state.setAudioPlayback(false);
        this.state.setStatus({ realtimeText: "", realtimeStatus: undefined });
        break;
      case "tts.start":
        this.closeAudioStream();
        this.audioStream = new VoiceAudioStream({
          encoding: (data?.encoding as string) ?? "linear16",
          sampleRate: (data?.sampleRate as number) ?? 48_000,
          channels: (data?.channels as number) ?? 1,
          mimeType: (data?.mimeType as string) ?? "audio/raw"
        });
        this.state.setAudioStream(this.audioStream);
        this.state.setAudioPlayback(true);
        break;
      case "tts.end":
        if (data?.errored) {
          this.closeAudioStream(new Error("tts stream ended with error"));
        } else {
          this.closeAudioStream();
        }
        this.state.setAudioPlayback(false);
        break;
      case "timeout":
        this.options.socket.close();
        this.state.resetStatus();
        this.closeAudioStream();
        this.state.setAudioPlayback(false);
        this.state.setStatus({ realtimeText: "", realtimeStatus: undefined });
        break;
      case "error":
        this.state.setStatus({
          stage: "error",
          error:
            data?.error ?? "Something went wrong while processing the voice command."
        });
        this.closeAudioStream();
        this.state.setAudioPlayback(false);
        this.state.setStatus({ realtimeStatus: "error" });
        this.options.notifications?.error?.(
          data?.error ?? "Something went wrong while processing the voice command."
        );
        break;
      case "closed":
        this.state.resetStatus();
        this.closeAudioStream();
        this.state.setAudioPlayback(false);
        this.state.setStatus({ realtimeText: "", realtimeStatus: undefined });
        break;
    }
  }

  private closeAudioStream(error?: Error) {
    if (this.audioStream) {
      if (error) {
        this.audioStream.fail(error);
      } else {
        this.audioStream.close();
      }
    }
    this.audioStream = null;
    this.state.clearAudioStream();
  }

  private async handleComplete(payload: any) {
    this.state.setStatus({ stage: "completed" });
    const formattedContent = payload?.formattedContent ?? null;
    const result: VoiceCommandResult = {
      timestamp: Date.now(),
      confidence: 1,
      data: {
        intent: payload?.intent ?? "fetch",
        transcript: this.state.getStatus().transcript ?? "",
        formattedContent,
        graphPaths: payload?.graphPaths ?? [],
        fallbackResults: payload?.fallbackResults ?? [],
        timestamp: payload?.timestamp ?? Date.now()
      }
    };

    this.state.pushResult(result);

    if (result.data?.intent === "fetch") {
      this.queryResponse = result;
      this.options.onQueryResponse?.(result);
    } else {
      const intent = result.data?.intent ?? "operation";
      const message =
        INTENT_SUCCESS_MESSAGES[intent] ??
        "Operation completed successfully!";
      this.options.notifications?.success?.(message);
    }
  }
}
