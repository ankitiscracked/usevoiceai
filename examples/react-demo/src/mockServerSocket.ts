type MessageListener = (event: MessageEvent) => void;

class LocalMessageEvent implements MessageEvent {
  constructor(public data: any) {}
  bubbles = false;
  cancelBubble = false;
  cancelable = false;
  composed = false;
  currentTarget: EventTarget | null = null;
  defaultPrevented = false;
  eventPhase = 0;
  isTrusted = true;
  returnValue = true;
  srcElement: EventTarget | null = null;
  target: EventTarget | null = null;
  timeStamp = Date.now();
  type = "message";
  ports: MessagePort[] = [];
  initMessageEvent(): void {}
  composedPath(): EventTarget[] {
    return [];
  }
  preventDefault(): void {}
  stopImmediatePropagation(): void {}
  stopPropagation(): void {}
  dataTransfer?: DataTransfer | null | undefined;
  lastEventId = "";
  origin = "";
  source: Window | MessagePort | ServiceWorker | null = null;
}

export class DemoWebSocket implements WebSocket {
  static OPEN = 1;
  static CLOSED = 3;

  binaryType: BinaryType = "arraybuffer";
  bufferedAmount = 0;
  extensions = "";
  protocol = "";
  readyState = 0;
  url: string;

  onclose: ((this: WebSocket, ev: CloseEvent) => any) | null = null;
  onerror: ((this: WebSocket, ev: Event) => any) | null = null;
  onmessage: ((this: WebSocket, ev: MessageEvent) => any) | null = null;
  onopen: ((this: WebSocket, ev: Event) => any) | null = null;

  private listeners: MessageListener[] = [];
  private closed = false;

  constructor(url: string) {
    this.url = url;
    queueMicrotask(() => {
      this.readyState = DemoWebSocket.OPEN;
      this.onopen?.call(this, new Event("open"));
      this.sendServerMessage({ type: "session.ready" });
    });
  }

  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject
  ): void {
    if (type === "message" && typeof listener === "function") {
      this.listeners.push(listener as MessageListener);
    }
  }

  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject
  ): void {
    if (type === "message" && typeof listener === "function") {
      this.listeners = this.listeners.filter((l) => l !== listener);
    }
  }

  dispatchEvent(_event: Event): boolean {
    return true;
  }

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    if (typeof data === "string") {
      try {
        const payload = JSON.parse(data);
        this.handleClientPayload(payload);
      } catch {
        // ignore
      }
    }
  }

  close(_code?: number, _reason?: string): void {
    this.closed = true;
    this.readyState = DemoWebSocket.CLOSED;
    this.onclose?.call(this, new CloseEvent("close"));
  }

  private handleClientPayload(payload: any) {
    switch (payload.type) {
      case "start":
        this.sendServerMessage({
          type: "transcript.partial",
          data: { transcript: "Listening..." }
        });
        break;
      case "end":
        this.simulateCompletion();
        break;
      case "cancel":
        this.sendServerMessage({ type: "session.cancelled" });
        break;
    }
  }

  private async simulateCompletion() {
    if (this.closed) return;
    this.sendServerMessage({
      type: "transcript.final",
      data: { transcript: "Demo transcript" }
    });
    this.sendServerMessage({
      type: "session.completed",
      data: {
        intent: "fetch",
        formattedContent: {
          format: "paragraph",
          content: "Demo response from mock server"
        },
        graphPaths: [],
        fallbackResults: [],
        timestamp: Date.now()
      }
    });
    this.sendServerMessage({
      type: "tts.start",
      data: {
        encoding: "linear16",
        sampleRate: 48_000,
        mimeType: "audio/raw"
      }
    });
    const chunks = [
      createSineWaveChunk(200, 440),
      createSineWaveChunk(200, 660),
      createSineWaveChunk(200, 880)
    ];
    chunks.forEach((chunk, index) => {
      setTimeout(() => {
        if (!this.closed) {
          this.sendBinaryChunk(chunk);
          if (index === chunks.length - 1) {
            this.sendServerMessage({ type: "tts.end" });
          }
        }
      }, index * 220);
    });
  }

  private sendServerMessage(payload: any) {
    const event = new LocalMessageEvent(JSON.stringify(payload));
    this.onmessage?.call(this, event);
    this.listeners.forEach((listener) => listener(event));
  }

  private sendBinaryChunk(buffer: ArrayBuffer) {
    const event = new LocalMessageEvent(buffer);
    this.onmessage?.call(this, event);
    this.listeners.forEach((listener) => listener(event));
  }
}

function createSineWaveChunk(
  durationMs: number,
  frequency: number,
  sampleRate = 48_000
): ArrayBuffer {
  const totalSamples = Math.max(1, Math.floor((durationMs / 1000) * sampleRate));
  const buffer = new ArrayBuffer(totalSamples * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const value = Math.sin(2 * Math.PI * frequency * t);
    const sample = Math.max(-1, Math.min(1, value));
    view.setInt16(i * 2, Math.round(sample * 32_767), true);
  }
  return buffer;
}
