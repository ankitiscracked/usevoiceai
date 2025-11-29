import type { SpeechProvider, SpeechStream } from "../../types";

export class MockSpeechProvider implements SpeechProvider {
  async send(
    text: string,
    handlers: Parameters<SpeechProvider["send"]>[1]
  ): Promise<SpeechStream> {
    const encoder = new TextEncoder();
    const chunks = text.split(/\s+/);
    const queue: ArrayBuffer[] = [];

    for (const chunk of chunks) {
      const buffer = encoder.encode(chunk).buffer;
      queue.push(buffer);
      handlers.onAudioChunk(buffer);
    }
    handlers.onClose();

    let closed = false;
    const speechStream: SpeechStream = {
      [Symbol.asyncIterator]() {
        return {
          next() {
            if (queue.length > 0) {
              const value = queue.shift()!;
              return Promise.resolve({ value, done: false });
            }
            if (closed) {
              return Promise.resolve({
                value: undefined as any,
                done: true,
              });
            }
            closed = true;
            return Promise.resolve({ value: undefined as any, done: true });
          },
          return() {
            closed = true;
            return Promise.resolve({
              value: undefined as any,
              done: true,
            });
          },
        };
      },
    };

    return speechStream;
  }
}
