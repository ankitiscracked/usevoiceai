import { describe, expect, it, vi } from "vitest";
import { VoiceCommandController } from "./voiceCommandController";
import { VoiceSocketClient } from "../socket/voiceSocketClient";
import { VoiceCommandStateStore } from "../state/voiceCommandState";

class MockSocket implements Partial<VoiceSocketClient> {
  listeners = new Set<(event: any) => void>();
  sendJson = vi.fn();
  sendBinary = vi.fn();
  ensureConnection = vi.fn(async () => ({} as WebSocket));
  close = vi.fn();

  subscribe(listener: (event: any) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: any) {
    this.listeners.forEach((listener) => listener(event));
  }
}

describe("VoiceCommandController", () => {
  it("updates state when receiving complete events", async () => {
    const socket = new MockSocket();
    const state = new VoiceCommandStateStore();
    const controller = new VoiceCommandController({
      socket: socket as unknown as VoiceSocketClient,
      state
    });

    socket.emit({
      type: "transcript.final",
      data: { transcript: "hello world" }
    });

    expect(state.getStatus().transcript).toBe("hello world");

    socket.emit({
      type: "complete",
      data: { intent: "fetch", formattedContent: { foo: "bar" } }
    });

    expect(state.getResults()).toHaveLength(1);
    expect(state.getResults()[0].data?.intent).toBe("fetch");

    controller.destroy();
  });

  it("creates audio streams for tts events", async () => {
    const socket = new MockSocket();
    const state = new VoiceCommandStateStore();
    const controller = new VoiceCommandController({
      socket: socket as unknown as VoiceSocketClient,
      state
    });

    socket.emit({
      type: "tts.start",
      data: { sampleRate: 48_000, encoding: "linear16", channels: 1 }
    });

    const stream = state.getAudioStream();
    expect(stream).toBeTruthy();
    const iterator = stream![Symbol.asyncIterator]();

    const nextChunk = iterator.next();
    const chunk = new ArrayBuffer(4);
    socket.emit(chunk);

    const resolved = await nextChunk;
    expect(resolved.done).toBe(false);
    expect(resolved.value?.byteLength).toBe(4);

    socket.emit({ type: "tts.end" });
    const doneResult = await iterator.next().catch(() => ({ done: true }));
    expect(doneResult.done).toBe(true);

    controller.destroy();
  });

  it("tracks partial transcripts", () => {
    const socket = new MockSocket();
    const state = new VoiceCommandStateStore();
    const controller = new VoiceCommandController({
      socket: socket as unknown as VoiceSocketClient,
      state
    });

    socket.emit({
      type: "transcript.partial",
      data: { transcript: "hello world" }
    });

    expect(state.getStatus().transcript).toBe("hello world");
    expect(state.getStatus().realtimeText).toBe("hello world");

    controller.destroy();
  });
});
