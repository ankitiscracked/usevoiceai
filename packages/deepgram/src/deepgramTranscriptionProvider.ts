import type {
  TranscriptionProvider,
  TranscriptionStream
} from "@voicecn/server";
import {
  createClient as createDeepgramClient,
  LiveTranscriptionEvents
} from "@deepgram/sdk";

const DeepgramEvents = {
  Open: LiveTranscriptionEvents.Open,
  Transcript: LiveTranscriptionEvents.Transcript,
  Close: LiveTranscriptionEvents.Close,
  Error: LiveTranscriptionEvents.Error
} as const;

export interface DeepgramProviderConfig {
  apiKey: string;
  model?: string;
  keepAliveIntervalMs?: number;
  defaultEncoding?: string;
  defaultSampleRate?: number;
  defaultChannels?: number;
  clientFactory?: typeof createDeepgramClient;
}

export class DeepgramTranscriptionProvider implements TranscriptionProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly keepAliveIntervalMs: number;
  private readonly defaultEncoding: string;
  private readonly defaultSampleRate: number;
  private readonly defaultChannels: number;
  private readonly createClient: typeof createDeepgramClient;

  constructor(config: DeepgramProviderConfig) {
    if (!config?.apiKey) {
      throw new Error("DeepgramTranscriptionProvider requires an apiKey");
    }

    this.apiKey = config.apiKey;
    this.model = config.model ?? "nova-3";
    this.keepAliveIntervalMs = config.keepAliveIntervalMs ?? 3000;
    this.defaultEncoding = config.defaultEncoding ?? "opus";
    this.defaultSampleRate = config.defaultSampleRate ?? 48_000;
    this.defaultChannels = config.defaultChannels ?? 1;
    this.createClient = config.clientFactory ?? createDeepgramClient;
  }

  async createStream({
    onTranscript,
    onError,
    onClose,
  }: Parameters<
    TranscriptionProvider["createStream"]
  >[0]): Promise<TranscriptionStream> {
    const client = this.createClient(this.apiKey);
    const stream = client.listen.live({
      model: this.model,
      punctuate: true,
      interim_results: true,
      utterance_end_ms: 1500,
      encoding: this.defaultEncoding,
      sampleRate: this.defaultSampleRate,
      channels: this.defaultChannels,
    });

    let keepAliveTimer: ReturnType<typeof setInterval> | null = null;
    let isOpen = false;
    const pending: ArrayBuffer[] = [];
    let finishResolve: (() => void) | null = null;
    let finishReject: ((error: Error) => void) | null = null;
    let finishSettled = false;

    const finishPromise = new Promise<void>((resolve, reject) => {
      finishResolve = resolve;
      finishReject = reject;
    });

    const settleFinish = (error?: Error) => {
      if (finishSettled) {
        return;
      }
      finishSettled = true;
      if (error) {
        finishReject?.(error);
      } else {
        finishResolve?.();
      }
    };

    const clearKeepAlive = () => {
      if (keepAliveTimer) {
        clearInterval(keepAliveTimer);
        keepAliveTimer = null;
      }
    };

    const toArrayBuffer = (chunk: ArrayBuffer | ArrayBufferView) => {
      if (chunk instanceof ArrayBuffer) {
        return chunk;
      }
      const view = chunk as ArrayBufferView;
      const copied = new ArrayBuffer(view.byteLength);
      new Uint8Array(copied).set(
        new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
      );
      return copied;
    };

    stream.on(DeepgramEvents.Open, () => {
      isOpen = true;
      for (const chunk of pending.splice(0, pending.length)) {
        try {
          stream.send(chunk);
        } catch (error) {
          console.warn("Failed to flush Deepgram chunk", error);
        }
      }
      keepAliveTimer = setInterval(() => {
        try {
          stream.keepAlive();
        } catch (error) {
          console.warn("Deepgram keepAlive failed", error);
        }
      }, this.keepAliveIntervalMs);
    });

    stream.on(DeepgramEvents.Transcript, (data: any) => {
      const alternative = data?.channel?.alternatives?.[0];
      const transcript = alternative?.transcript as string | undefined;
      if (!transcript) return;
      onTranscript({
        transcript,
        isFinal: Boolean(data?.is_final),
      });
    });

    stream.on(DeepgramEvents.Close, () => {
      isOpen = false;
      clearKeepAlive();
      settleFinish();
      onClose?.();
    });

    stream.on(DeepgramEvents.Error, (cause: unknown) => {
      isOpen = false;
      pending.length = 0;
      clearKeepAlive();
      const error =
        cause instanceof Error
          ? cause
          : new Error(
              typeof cause === "string"
                ? cause
                : "Deepgram live transcription error"
            );
      settleFinish(error);
      onError?.(error);
    });

    return {
      send: (chunk) => {
        if (!isOpen) {
          pending.push(toArrayBuffer(chunk));
          return;
        }
        try {
          stream.send(toArrayBuffer(chunk));
        } catch (error) {
          console.warn("Failed to send Deepgram chunk", error);
        }
      },
      finish: async () => {
        isOpen = false;
        clearKeepAlive();
        stream.finalize();
        stream.requestClose();
        await finishPromise;
      },
      abort: (reason?: string) => {
        isOpen = false;
        pending.length = 0;
        clearKeepAlive();
        stream.requestClose();
        settleFinish(
          reason ? new Error(reason) : new Error("transcription aborted")
        );
      },
    };
  }
}
