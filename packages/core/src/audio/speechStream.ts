export interface SpeechStreamInfo {
  encoding: string;
  sampleRate: number;
  channels: number;
  mimeType: string;
}

type SpeechStreamReleaseHandler = (stream: SpeechStream) => void;

type PendingWaiter = {
  resolve: (result: IteratorResult<ArrayBuffer>) => void;
  reject: (error: unknown) => void;
};

const createStreamId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `voice-audio-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const toArrayBuffer = (chunk: ArrayBuffer | ArrayBufferView): ArrayBuffer => {
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

export class SpeechStream implements AsyncIterableIterator<ArrayBuffer> {
  readonly id: string;
  readonly encoding: string;
  readonly sampleRate: number;
  readonly channels: number;
  readonly mimeType: string;

  private queue: ArrayBuffer[] = [];
  private waiters: PendingWaiter[] = [];
  private closed = false;
  private error: Error | null = null;
  private releaseHandlers = new Set<SpeechStreamReleaseHandler>();
  private released = false;

  constructor(info: SpeechStreamInfo) {
    this.id = createStreamId();
    this.encoding = info.encoding;
    this.sampleRate = info.sampleRate;
    this.channels = info.channels;
    this.mimeType = info.mimeType;
  }

  onRelease(handler: SpeechStreamReleaseHandler): () => void {
    if (this.released) {
      handler(this);
      return () => {};
    }
    this.releaseHandlers.add(handler);
    return () => {
      this.releaseHandlers.delete(handler);
    };
  }

  release() {
    if (this.released) {
      return;
    }
    this.released = true;
    for (const handler of this.releaseHandlers) {
      try {
        handler(this);
      } catch {
        // Ignore release handler errors to avoid cascading failures.
      }
    }
    this.releaseHandlers.clear();
  }

  push(chunk: ArrayBuffer | ArrayBufferView) {
    if (this.closed) {
      return;
    }
    const buffer = toArrayBuffer(chunk);
    if (this.waiters.length > 0) {
      const waiter = this.waiters.shift();
      waiter?.resolve({ value: buffer, done: false });
      return;
    }
    this.queue.push(buffer);
  }

  close() {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.flushWaiters();
    this.queue.length = 0;
  }

  fail(error: Error) {
    if (this.closed) {
      return;
    }
    this.error = error;
    this.close();
  }

  [Symbol.asyncIterator]() {
    return this;
  }

  next(): Promise<IteratorResult<ArrayBuffer>> {
    if (this.queue.length > 0) {
      const value = this.queue.shift()!;
      return Promise.resolve({ value, done: false });
    }

    if (this.closed) {
      if (this.error) {
        return Promise.reject(this.error);
      }
      return Promise.resolve({ value: undefined, done: true });
    }

    return new Promise<IteratorResult<ArrayBuffer>>((resolve, reject) => {
      this.waiters.push({ resolve, reject });
    });
  }

  return(): Promise<IteratorResult<ArrayBuffer>> {
    this.close();
    return Promise.resolve({ value: undefined, done: true });
  }

  private flushWaiters() {
    while (this.waiters.length > 0) {
      const waiter = this.waiters.shift();
      if (!waiter) {
        continue;
      }
      if (this.error) {
        waiter.reject(this.error);
      } else {
        waiter.resolve({ value: undefined, done: true });
      }
    }
  }
}
