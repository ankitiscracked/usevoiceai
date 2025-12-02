import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { useVoice } from "./useVoice";
import { VoiceInputStore } from "@usevoiceai/core";

class MockSocket {
  listeners = new Set<(event: any) => void>();
  sendJson = vi.fn();
  sendBinary = vi.fn();
  ensureConnection = vi.fn(async () => ({} as WebSocket));
  close = vi.fn();

  subscribe(listener: (event: any) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

describe("@usevoiceai/vue useVoice", () => {
  let store: VoiceInputStore;
  let socket: MockSocket;

  beforeEach(() => {
    store = new VoiceInputStore();
    socket = new MockSocket();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("exposes reactive status", () => {
    const { status } = useVoice({ state: store, socket: socket as any });
    expect(status.value.stage).toBe("idle");

    store.setStatus({ stage: "recording" });
    expect(status.value.stage).toBe("recording");
  });

  it("updates recording state", () => {
    const { isRecording } = useVoice({ state: store, socket: socket as any });
    expect(isRecording.value).toBe(false);
    store.setStatus({ stage: "recording" });
    expect(isRecording.value).toBe(true);
  });
});
