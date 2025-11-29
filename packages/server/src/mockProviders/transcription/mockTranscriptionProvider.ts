import type {
  SpeechEndHint,
  TranscriptEvent,
  TranscriptionProvider,
  TranscriptStream
} from "../../types";

export interface MockTranscriptionProviderOptions {
  transcript?: string;
}

export class MockTranscriptionProvider
  implements TranscriptionProvider
{
  private lastSpeechEndCallback: ((hint?: SpeechEndHint) => void) | null = null;
  private lastTranscriptCallback:
    | ((event: { transcript: string; isFinal: boolean }) => void)
    | null = null;
  private lastTranscriptEmitted = false;
  private enqueueEvent: ((event: TranscriptEvent) => void) | null = null;
  private closeStream: (() => void) | null = null;

  constructor(private options: MockTranscriptionProviderOptions = {}) {}

  async createStream({
    onTranscript,
    onSpeechEnd
  }: Parameters<TranscriptionProvider["createStream"]>[0]): Promise<TranscriptStream> {
    let aborted = false;
    let buffer: ArrayBuffer[] = [];
    this.lastSpeechEndCallback = onSpeechEnd ?? null;
    this.lastTranscriptCallback = onTranscript ?? null;
    this.lastTranscriptEmitted = false;

    const pendingResolvers: Array<
      (result: IteratorResult<TranscriptEvent>) => void
    > = [];
    const queue: TranscriptEvent[] = [];
    let closed = false;

    this.enqueueEvent = (event: TranscriptEvent) => {
      if (closed) return;
      const resolve = pendingResolvers.shift();
      if (resolve) {
        resolve({ value: event, done: false });
      } else {
        queue.push(event);
      }
    };

    this.closeStream = () => {
      if (closed) return;
      closed = true;
      while (pendingResolvers.length) {
        const resolve = pendingResolvers.shift();
        resolve?.({ value: undefined as any, done: true });
      }
    };

    const transcriptStream: AsyncIterable<TranscriptEvent> = {
      [Symbol.asyncIterator]() {
        return {
          next() {
            if (queue.length > 0) {
              const value = queue.shift()!;
              return Promise.resolve({ value, done: false });
            }
            if (closed) {
              return Promise.resolve({ value: undefined as any, done: true });
            }
            return new Promise((resolve) => {
              pendingResolvers.push(resolve);
            });
          },
          return() {
            close();
            return Promise.resolve({ value: undefined as any, done: true });
          }
        };
      }
    };

    return {
      send: (chunk) => {
        if (chunk instanceof ArrayBuffer) {
          buffer.push(chunk);
          return;
        }
        const view = chunk as ArrayBufferView;
        const copied = new ArrayBuffer(view.byteLength);
        new Uint8Array(copied).set(
          new Uint8Array(
            view.buffer,
            view.byteOffset,
            view.byteLength
          )
        );
        buffer.push(copied);
      },
      finish: async () => {
        if (aborted || this.lastTranscriptEmitted) {
          this.closeStream?.();
          return;
        }
        const defaultTranscript =
          this.options.transcript ??
          `mock transcript (${buffer.length} chunks)`;
        this.lastTranscriptCallback?.({
          transcript: defaultTranscript,
          isFinal: true
        });
        this.enqueueEvent?.({
          type: "transcript",
          transcript: defaultTranscript,
          isFinal: true
        });
        this.lastTranscriptEmitted = true;
        this.closeStream?.();
      },
      abort: () => {
        aborted = true;
        buffer = [];
        this.closeStream?.();
      },
      [Symbol.asyncIterator]() {
        return transcriptStream[Symbol.asyncIterator]();
      }
    };
  }

  triggerSpeechEnd(hint?: SpeechEndHint) {
    if (!this.lastTranscriptEmitted) {
      const fallback =
        this.options.transcript ?? "mock transcript (auto speech end)";
      this.lastTranscriptCallback?.({
        transcript: fallback,
        isFinal: true
      });
      this.lastTranscriptEmitted = true;
      this.enqueueEvent?.({
        type: "transcript",
        transcript: fallback,
        isFinal: true
      });
    }
    this.enqueueEvent?.({ type: "speech-end", hint });
    this.lastSpeechEndCallback?.(hint);
  }

  triggerPartial(transcript: string) {
    this.lastTranscriptCallback?.({
      transcript,
      isFinal: false
    });
    this.enqueueEvent?.({
      type: "transcript",
      transcript,
      isFinal: false
    });
  }
}
