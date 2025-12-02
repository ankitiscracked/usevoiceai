import type {
  VoiceInputResult,
  VoiceCommandStage,
  VoiceCommandStatus,
} from "../types";
import type { SpeechStream } from "../audio/speechStream";
import { SimpleEventEmitter } from "../utils/eventEmitter";

interface StateEvents {
  change: VoiceCommandStatus;
  results: VoiceInputResult[];
  playback: boolean;
  audioStream: SpeechStream | null;
}

export class VoiceInputStore {
  private status: VoiceCommandStatus = { stage: "idle" };
  private results: VoiceInputResult[] = [];
  private audioStream: SpeechStream | null = null;
  private audioPlaying = false;
  private emitter = new SimpleEventEmitter<StateEvents>();

  getStatus() {
    return this.status;
  }

  getResults() {
    return this.results;
  }

  getAudioStream() {
    return this.audioStream;
  }

  isAudioPlaying() {
    return this.audioPlaying;
  }

  isRecording() {
    return this.status.stage === "recording";
  }

  subscribe(handler: (status: VoiceCommandStatus) => void) {
    return this.emitter.on("change", handler);
  }

  subscribeResults(handler: (results: VoiceInputResult[]) => void) {
    return this.emitter.on("results", handler);
  }

  subscribePlayback(handler: (playing: boolean) => void) {
    return this.emitter.on("playback", handler);
  }

  subscribeAudioStream(handler: (stream: SpeechStream | null) => void) {
    return this.emitter.on("audioStream", handler);
  }

  setStatus(patch: Partial<VoiceCommandStatus>) {
    this.status = { ...this.status, ...patch };
    this.emitter.emit("change", this.status);
  }

  updateStage(stage: VoiceCommandStage) {
    this.setStatus({ stage });
  }

  resetStatus() {
    this.status = { stage: "idle" };
    this.emitter.emit("change", this.status);
  }

  pushResult(result: VoiceInputResult) {
    this.results = [result, ...this.results];
    this.emitter.emit("results", this.results);
  }

  clearResults() {
    this.results = [];
    this.emitter.emit("results", this.results);
  }

  setAudioStream(stream: SpeechStream | null) {
    this.audioStream = stream;
    this.emitter.emit("audioStream", stream);
  }

  clearAudioStream() {
    this.setAudioStream(null);
  }

  setAudioPlayback(playing: boolean) {
    this.audioPlaying = playing;
    this.emitter.emit("playback", playing);
  }

  resetButKeepResults() {
    this.resetStatus();
    this.clearAudioStream();
    this.setAudioPlayback(false);
  }

  reset() {
    this.resetStatus();
    this.clearResults();
    this.clearAudioStream();
    this.setAudioPlayback(false);
  }
}
