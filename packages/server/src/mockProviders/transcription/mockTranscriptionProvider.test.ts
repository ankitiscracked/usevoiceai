import { describe, expect, it } from "vitest";
import { MockTranscriptionProvider } from "./mockTranscriptionProvider";
import type { TranscriptEvent } from "../../types";

const collect = async <T>(iterable: AsyncIterable<T>) => {
  const result: T[] = [];
  for await (const value of iterable) {
    result.push(value);
  }
  return result;
};

describe("MockTranscriptionProvider iterable", () => {
  it("yields transcript and speech-end events via async iterator", async () => {
    const provider = new MockTranscriptionProvider({
      transcript: "final transcript",
    });

    const stream = await provider.createStream({
      onTranscript: () => {},
      onError: () => {},
    });

    // Emit a partial transcript and a speech-end hint
    provider.triggerPartial("hello");
    provider.triggerSpeechEnd({ reason: "done" });

    const eventsPromise = collect<TranscriptEvent>(stream);
    await stream.finish();
    const events = await eventsPromise;

    expect(events).toEqual([
      { type: "transcript", transcript: "hello", isFinal: false },
      {
        type: "transcript",
        transcript: "final transcript",
        isFinal: true,
      },
      { type: "speech-end", hint: { reason: "done" } },
    ]);
  });
});
