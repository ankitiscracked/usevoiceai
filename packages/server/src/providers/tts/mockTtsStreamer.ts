import type { TtsStreamer } from "../../types";

export class MockTtsStreamer implements TtsStreamer {
  async stream(
    text: string,
    handlers: Parameters<TtsStreamer["stream"]>[1]
  ): Promise<void> {
    const encoder = new TextEncoder();
    const chunks = text.split(/\s+/);
    for (const chunk of chunks) {
      handlers.onAudioChunk(encoder.encode(chunk).buffer);
    }
    handlers.onClose();
  }
}
