import { describe, expect, it, vi } from "vitest";
import { HumeSpeechProvider } from "./humeSpeechProvider";

async function* fakeStream(events: any[]) {
  for (const event of events) {
    yield event;
  }
}

describe("HumeSpeechProvider", () => {
  it("requires an api key", () => {
    expect(() => new HumeSpeechProvider({ apiKey: "" })).toThrow();
  });

  it("streams audio chunks and closes", async () => {
    const onAudioChunk = vi.fn();
    const onClose = vi.fn();
    const requests: Record<string, unknown>[] = [];

    const provider = new HumeSpeechProvider({
      apiKey: "key",
      clientFactory: () =>
        ({
          tts: {
            synthesizeJsonStreaming: async (options: Record<string, unknown>) => {
              requests.push(options);
              return fakeStream([
                { type: "audio", audio: Buffer.from("demo").toString("base64") },
              ]);
            },
          },
        }) as any,
    });

    const stream = await provider.send("hello world", {
      onAudioChunk,
      onClose,
      onError: vi.fn(),
    });

    expect(onAudioChunk).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
    expect(requests[0]?.stripHeaders).toBe(true);
    expect((requests[0] as any)?.format?.sampleRate).toBe(48_000);

    const collected: ArrayBuffer[] = [];
    for await (const chunk of stream) {
      collected.push(chunk);
    }
    expect(collected.length).toBe(1);
  });

  it("surfaces error events", async () => {
    const onError = vi.fn();

    const provider = new HumeSpeechProvider({
      apiKey: "key",
      clientFactory: () =>
        ({
          tts: {
            synthesizeJsonStreaming: async () =>
              fakeStream([{ type: "error", error: "boom" }]),
          },
        }) as any,
    });

    await expect(
      provider.send("hello", {
        onAudioChunk: vi.fn(),
        onClose: vi.fn(),
        onError,
      })
    ).rejects.toThrow();

    expect(onError).toHaveBeenCalled();
  });
});
