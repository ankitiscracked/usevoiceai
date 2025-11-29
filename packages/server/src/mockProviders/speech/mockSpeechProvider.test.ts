import { describe, expect, it } from "vitest";
import { MockSpeechProvider } from "./mockSpeechProvider";

const buffersToStrings = (chunks: ArrayBuffer[]) => {
  const decoder = new TextDecoder();
  return chunks.map((chunk) => decoder.decode(new Uint8Array(chunk)));
};

const collect = async <T>(iterable: AsyncIterable<T>) => {
  const result: T[] = [];
  for await (const value of iterable) {
    result.push(value);
  }
  return result;
};

describe("MockSpeechProvider iterable", () => {
  it("yields audio chunks via async iterator", async () => {
    const provider = new MockSpeechProvider();
    const streamedChunks: ArrayBuffer[] = [];
    const stream = await provider.send("hello world", {
      onAudioChunk: (chunk) => streamedChunks.push(chunk),
      onClose: () => {},
      onError: () => {},
    });

    const iteratedChunks = await collect(stream);

    expect(buffersToStrings(streamedChunks)).toEqual(["hello", "world"]);
    expect(buffersToStrings(iteratedChunks)).toEqual(["hello", "world"]);
  });
});
