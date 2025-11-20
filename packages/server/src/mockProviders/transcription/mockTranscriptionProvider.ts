import type {
  SpeechEndHint,
  TranscriptionProvider,
  TranscriptionStream
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

  constructor(private options: MockTranscriptionProviderOptions = {}) {}

  async createStream({
    onTranscript,
    onSpeechEnd
  }: Parameters<TranscriptionProvider["createStream"]>[0]): Promise<TranscriptionStream> {
    let aborted = false;
    let buffer: ArrayBuffer[] = [];
    this.lastSpeechEndCallback = onSpeechEnd ?? null;
    this.lastTranscriptCallback = onTranscript ?? null;
    this.lastTranscriptEmitted = false;

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
        if (aborted || this.lastTranscriptEmitted) return;
        const defaultTranscript =
          this.options.transcript ??
          `mock transcript (${buffer.length} chunks)`;
        this.lastTranscriptCallback?.({
          transcript: defaultTranscript,
          isFinal: true
        });
        this.lastTranscriptEmitted = true;
      },
      abort: () => {
        aborted = true;
        buffer = [];
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
    }
    this.lastSpeechEndCallback?.(hint);
  }

  triggerPartial(transcript: string) {
    this.lastTranscriptCallback?.({
      transcript,
      isFinal: false
    });
  }
}
