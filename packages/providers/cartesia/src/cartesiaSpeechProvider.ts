import type { SpeechProvider, SpeechStream } from "@usevoiceai/server";
import { CartesiaClient } from "@cartesia/cartesia-js";

const DEFAULT_VOICE_ID = "66c6b81c-ddb7-4892-bdd5-19b5a7be38e7";

type CartesiaClientLike = {
  tts: {
    sse: (
      options: Record<string, unknown>
    ) =>
      | AsyncIterable<CartesiaStreamEvent>
      | AsyncIterator<CartesiaStreamEvent>
      | Promise<
          AsyncIterable<CartesiaStreamEvent> | AsyncIterator<CartesiaStreamEvent>
        >;
  };
};

type CartesiaStreamEvent =
  | { type: "chunk"; data?: string }
  | { type: "done" }
  | { type: "error"; error?: string }
  | { type: string; data?: string; error?: string };

export interface CartesiaSpeechConfig {
  apiKey?: string;
  modelId: string;
  voiceId?: string;
  clientFactory?: () => CartesiaClientLike;
}

export class CartesiaSpeechProvider implements SpeechProvider {
  private readonly apiKey: string;
  private readonly modelId: string;
  private readonly voiceId: string;
  private readonly clientFactory: () => CartesiaClientLike;

  constructor(config: CartesiaSpeechConfig) {
    let apiKey = config.apiKey;

    if (!apiKey) {
      if (typeof process !== "undefined") {
        apiKey = process.env.CARTESIA_API_KEY ?? "";
      }
    }

    if (!apiKey) {
      throw new Error("CartesiaSpeechProvider requires an apiKey");
    }

    this.apiKey = apiKey;
    this.modelId = config.modelId;
    this.voiceId = config.voiceId ?? DEFAULT_VOICE_ID;
    this.clientFactory =
      config.clientFactory ??
      (() =>
        new CartesiaClient({ apiKey: this.apiKey }) as unknown as CartesiaClientLike);
  }

  async send(
    text: string,
    handlers: Parameters<SpeechProvider["send"]>[1]
  ): Promise<SpeechStream> {
    const normalized = text?.trim();
    if (!normalized) {
      handlers.onClose?.();
      return {
        [Symbol.asyncIterator]() {
          return {
            next() {
              return Promise.resolve({
                value: undefined as any,
                done: true,
              });
            },
          };
        },
      };
    }

    const client = this.clientFactory();
    let stream:
      | AsyncIterable<CartesiaStreamEvent>
      | AsyncIterator<CartesiaStreamEvent>
      | null = null;

    const queued: ArrayBuffer[] = [];
    const resolvers: Array<(result: IteratorResult<ArrayBuffer>) => void> = [];
    const rejecters: Array<(error: Error) => void> = [];
    let closed = false;
    let failed: Error | null = null;

    const pushChunk = (chunk: ArrayBuffer) => {
      const resolve = resolvers.shift();
      if (resolve) {
        rejecters.shift();
        resolve({ value: chunk, done: false });
      } else {
        queued.push(chunk);
      }
    };

    const close = () => {
      if (closed) return;
      closed = true;
      while (resolvers.length) {
        const resolve = resolvers.shift();
        rejecters.shift();
        resolve?.({ value: undefined as any, done: true });
      }
    };

    const fail = (error: Error) => {
      if (closed || failed) return;
      failed = error;
      while (rejecters.length) {
        const reject = rejecters.shift();
        resolvers.shift();
        reject?.(error);
      }
    };

    const speechStream: SpeechStream = {
      cancel: (reason?: string) => {
        const error = new Error(reason ?? "speech stream cancelled by caller");
        fail(error);
        close();
      },
      [Symbol.asyncIterator]() {
        return {
          next() {
            if (queued.length) {
              const value = queued.shift()!;
              return Promise.resolve({ value, done: false });
            }
            if (failed) {
              return Promise.reject(failed);
            }
            if (closed) {
              return Promise.resolve({
                value: undefined as any,
                done: true,
              });
            }
            return new Promise<IteratorResult<ArrayBuffer>>(
              (resolve, reject) => {
                resolvers.push(resolve);
                rejecters.push(reject);
              }
            );
          },
          return() {
            close();
            return Promise.resolve({
              value: undefined as any,
              done: true,
            });
          },
        };
      },
    };

    try {
      stream = (await client.tts.sse({
        modelId: this.modelId,
        transcript: normalized,
        voice: { mode: "id", id: this.voiceId },
        outputFormat: {
          container: "raw",
          encoding: "pcm_s16le",
          sampleRate: 48_000,
        },
      })) as AsyncIterable<CartesiaStreamEvent>;

      let completed = false;
      for await (const event of stream) {
        if (!event) continue;

        switch (event.type) {
          case "chunk":
            if (typeof event.data === "string" && event.data.length > 0) {
              const chunk = base64ToArrayBuffer(event.data);
              handlers.onAudioChunk(chunk);
              pushChunk(chunk);
            }
            break;
          case "done":
            completed = true;
            break;
          case "error": {
            const message =
              typeof event.error === "string" && event.error.length > 0
                ? event.error
                : "Cartesia stream error";
            throw new Error(message);
          }
          default:
            break;
        }

        if (completed) {
          break;
        }
      }

      handlers.onClose?.();
      close();
    } catch (cause) {
      const error = normalizeCartesiaError(cause);
      fail(error);
      handlers.onError?.(error);
      throw error;
    }

    return speechStream;
  }
}

function normalizeCartesiaError(cause: unknown): Error {
  if (cause instanceof Error) {
    return cause;
  }
  if (cause && typeof cause === "object" && "message" in (cause as any)) {
    return new Error(String((cause as { message: unknown }).message));
  }
  return new Error("Cartesia TTS stream error");
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  if (typeof atob === "function") {
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  const buffer = Buffer.from(base64, "base64");
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  );
}
