import { describe, expect, it, vi } from "vitest";
import { CartesiaSpeechProvider } from "./cartesiaSpeechProvider";

async function* fakeStream(events: any[]) {
  for (const event of events) {
    yield event;
  }
}

describe("CartesiaTtsStreamer", () => {
  it("validates required config", () => {
    expect(
      () => new CartesiaSpeechProvider({ apiKey: "", modelId: "sonic" })
    ).toThrow();
  });

  it("streams audio chunks and exposes iterable", async () => {
    const onAudioChunk = vi.fn();
    const onClose = vi.fn();

    const streamer = new CartesiaSpeechProvider({
      apiKey: "key",
      modelId: "sonic",
      voiceId: "voice-123",
      clientFactory: () =>
        ({
          tts: {
            sse: async () =>
              fakeStream([
                { type: "chunk", data: Buffer.from("demo").toString("base64") },
                { type: "done" },
              ]),
          },
        } as any),
    });

    const stream = await streamer.send("hello", {
      onAudioChunk,
      onClose,
      onError: vi.fn(),
    });

    expect(onAudioChunk).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();

    const collected: ArrayBuffer[] = [];
    for await (const chunk of stream) {
      collected.push(chunk);
    }
    expect(collected.length).toBe(1);
  });
});
