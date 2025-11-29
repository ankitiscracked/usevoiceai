import type { SpeechProvider, SpeechStream } from "@usevoiceai/server";

type HumeStreamEvent =
  | { type?: string; audio?: string; error?: string; message?: string }
  | { [key: string]: unknown };

type HumeTtsClientLike = {
  synthesizeJsonStreaming: (
    options: Record<string, unknown>
  ) =>
    | AsyncIterable<HumeStreamEvent>
    | AsyncIterator<HumeStreamEvent>
    | Promise<
        AsyncIterable<HumeStreamEvent> | AsyncIterator<HumeStreamEvent>
      >;
};

type HumeClientLike = {
  tts: HumeTtsClientLike;
};

export interface HumeVoiceConfig {
  name: string;
  provider?: string;
  description?: string;
}

export interface HumeSpeechConfig {
  apiKey?: string;
  voice?: HumeVoiceConfig;
  sampleRate?: number;
  stripHeaders?: boolean;
  apiVersion?: string;
  requestOptions?: Record<string, unknown>;
  clientFactory?: () => Promise<HumeClientLike> | HumeClientLike;
}

export class HumeSpeechProvider implements SpeechProvider {
  private readonly apiKey: string;
  private readonly voice: HumeVoiceConfig;
  private readonly sampleRate: number;
  private readonly stripHeaders: boolean;
  private readonly apiVersion: string;
  private readonly requestOptions: Record<string, unknown>;
  private readonly clientFactory: () => Promise<HumeClientLike>;

  constructor(config: HumeSpeechConfig) {
    let apiKey = config.apiKey;
    if (!apiKey && typeof process !== "undefined") {
      apiKey = process.env.HUME_API_KEY ?? "";
    }

    if (!apiKey) {
      throw new Error("HumeSpeechProvider requires an apiKey");
    }

    this.apiKey = apiKey;
    this.voice = config.voice ?? { name: "Ava Song", provider: "HUME_AI" };
    this.sampleRate = config.sampleRate ?? 48_000;
    this.stripHeaders = config.stripHeaders ?? true;
    this.apiVersion = config.apiVersion ?? "2";
    this.requestOptions = config.requestOptions ?? {};
    this.clientFactory =
      config.clientFactory !== undefined
        ? () => Promise.resolve(config.clientFactory!())
        : async () => {
            const moduleName = "hume";
            let mod: any;
            try {
              mod = await import(moduleName);
            } catch (error) {
              throw new Error(
                "Missing optional dependency `hume`. Install it to enable Hume TTS."
              );
            }

            const HumeClient =
              mod?.HumeClient ?? mod?.default?.HumeClient ?? mod?.default;
            if (!HumeClient) {
              throw new Error("HumeClient export not found in `hume` package");
            }

            return new HumeClient({ apiKey: this.apiKey }) as HumeClientLike;
          };
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

    const client = await this.clientFactory();

    const utterance: Record<string, unknown> = {
      text: normalized,
      voice: {
        name: this.voice.name,
        ...(this.voice.provider ? { provider: this.voice.provider } : {}),
      },
    };

    if (this.voice.description) {
      utterance.description = this.voice.description;
    }

    const request: Record<string, unknown> = {
      utterances: [utterance],
      stripHeaders: this.stripHeaders,
      version: this.apiVersion,
      ...this.requestOptions,
    };

    const requestFormat = {
      type: "pcm",
      sampleRate: this.sampleRate,
      ...(this.requestOptions?.format as Record<string, unknown> | undefined),
    };
    request.format = requestFormat;

    let stream:
      | AsyncIterable<HumeStreamEvent>
      | AsyncIterator<HumeStreamEvent>
      | null = null;

    try {
      stream = (await client.tts.synthesizeJsonStreaming(
        request
      )) as AsyncIterable<HumeStreamEvent>;
    } catch (cause) {
      const error = normalizeHumeError(cause);
      handlers.onError(error);
      throw error;
    }

    let errorHandled = false;
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
        const error = new Error(
          reason ?? "speech stream cancelled by caller"
        );
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
      for await (const chunk of stream) {
        if (!chunk) continue;

        const type = typeof chunk.type === "string" ? chunk.type : "";
        if (type.toLowerCase() === "audio" && typeof (chunk as any).audio === "string") {
          const audio = (chunk as any).audio as string;
          if (audio.length > 0) {
            const buffer = base64ToArrayBuffer(audio);
            handlers.onAudioChunk(buffer);
            pushChunk(buffer);
          }
          continue;
        }

        if (type.toLowerCase() === "error" || (chunk as any).error) {
          errorHandled = true;
          const message =
            (chunk as any).error ??
            (chunk as any).message ??
            "Hume TTS stream error";
          const error = new Error(String(message));
          handlers.onError(error);
          throw error;
        }
      }

      handlers.onClose?.();
      close();
    } catch (cause) {
      if (errorHandled) {
        throw cause;
      }
      const error = normalizeHumeError(cause);
      fail(error);
      handlers.onError(error);
      throw error;
    }

    return speechStream;
  }
}

function normalizeHumeError(cause: unknown): Error {
  if (cause instanceof Error) {
    return cause;
  }
  if (cause && typeof cause === "object") {
    const maybeError =
      (cause as any).message ?? (cause as any).error ?? (cause as any).type;
    if (maybeError) {
      return new Error(String(maybeError));
    }
  }
  return new Error("Hume TTS stream error");
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
