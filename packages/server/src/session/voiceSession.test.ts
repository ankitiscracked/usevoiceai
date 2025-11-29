import { describe, expect, it, vi } from "vitest";
import { VoiceSession } from "./voiceSession";
import {
  MockAgentProcessor,
  MockSpeechProvider,
  MockTranscriptionProvider,
} from "../mockProviders";
import type { AgentProcessor, SpeechProvider, SpeechStream } from "../types";

class ControlledSpeechProvider implements SpeechProvider {
  private handlers:
    | {
        onAudioChunk: (chunk: ArrayBuffer) => void;
        onClose: () => void;
        onError: (error: Error) => void;
      }
    | null = null;
  private deferred: { resolve: () => void; reject: (error: Error) => void } | null =
    null;
  private endIterators: Array<
    (result: IteratorResult<ArrayBuffer>) => void
  > = [];
  private closed = false;

  async send(
    text: string,
    handlers: Parameters<SpeechProvider["send"]>[1]
  ): Promise<SpeechStream> {
    this.handlers = handlers;
    const speechStream: SpeechStream = {
      cancel: () => {
        this.closed = true;
        while (this.endIterators.length) {
          const resolve = this.endIterators.shift();
          resolve?.({ value: undefined as any, done: true });
        }
      },
      [Symbol.asyncIterator]: () => ({
        next: () => {
          if (this.closed) {
            return Promise.resolve({
              value: undefined as any,
              done: true,
            });
          }
          return new Promise<IteratorResult<ArrayBuffer>>((resolve) => {
            this.endIterators.push(resolve);
          });
        },
        return: () => {
          this.closed = true;
          while (this.endIterators.length) {
            const resolve = this.endIterators.shift();
            resolve?.({ value: undefined as any, done: true });
          }
          return Promise.resolve({
            value: undefined as any,
            done: true,
          });
        },
      }),
    };

    await new Promise<void>((resolve, reject) => {
      this.deferred = { resolve, reject };
    });
    this.closed = true;
    while (this.endIterators.length) {
      const resolve = this.endIterators.shift();
      resolve?.({ value: undefined as any, done: true });
    }
    return speechStream;
  }

  close() {
    if (!this.handlers || !this.deferred) {
      return;
    }
    this.handlers.onClose();
    this.deferred.resolve();
    this.handlers = null;
    this.deferred = null;
    this.closed = true;
    while (this.endIterators.length) {
      const resolve = this.endIterators.shift();
      resolve?.({ value: undefined as any, done: true });
    }
  }
}

describe("VoiceSessionManager", () => {
  it("processes transcript and sends events", async () => {
    const sendJson = vi.fn();
    const sendBinary = vi.fn();
    const closeSocket = vi.fn();

    const session = new VoiceSession({
      userId: "user-1",
      transcriptionProvider: new MockTranscriptionProvider({
        transcript: "hello world",
      }),
      agentProcessor: new MockAgentProcessor({ responsePrefix: "result" }),
      speechProvider: new MockSpeechProvider(),
      sendJson,
      sendBinary,
      closeSocket,
    });

    session.handleOpen();
    await session.handleMessage(
      JSON.stringify({
        type: "start",
      })
    );
    await session.handleMessage(JSON.stringify({ type: "end" }));

    expect(sendJson).toHaveBeenCalledWith({ type: "command-started" });
    expect(sendJson).toHaveBeenCalledWith(
      expect.objectContaining({ type: "complete" })
    );
  });

  it("auto completes when speech end hints arrive", async () => {
    const sendJson = vi.fn();
    const sendBinary = vi.fn();
    const closeSocket = vi.fn();

    const transcription = new MockTranscriptionProvider({
      transcript: "auto world",
    });

    const session = new VoiceSession({
      userId: "user-2",
      transcriptionProvider: transcription,
      agentProcessor: new MockAgentProcessor({ responsePrefix: "auto" }),
      speechProvider: new MockSpeechProvider(),
      sendJson,
      sendBinary,
      closeSocket,
    });

    session.handleOpen();
    await session.handleMessage(
      JSON.stringify({
        type: "start",
        speechEndDetection: { mode: "auto" },
      })
    );

    transcription.triggerSpeechEnd({ reason: "silence" });

    await Promise.resolve();
    await Promise.resolve();

    expect(sendJson).toHaveBeenCalledWith(
      expect.objectContaining({ type: "speech-end.hint" })
    );
    expect(sendJson).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "transcript.final",
        data: { transcript: "auto world" },
      })
    );
    expect(sendJson).toHaveBeenCalledWith(
      expect.objectContaining({ type: "complete" })
    );
  });

  it("interrupts tts when new transcripts arrive during playback", async () => {
    const sendJson = vi.fn();
    const sendBinary = vi.fn();
    const closeSocket = vi.fn();

    const transcription = new MockTranscriptionProvider({
      transcript: "first",
    });

    const speech = new ControlledSpeechProvider();

    const session = new VoiceSession({
      userId: "user-3",
      transcriptionProvider: transcription,
      agentProcessor: new MockAgentProcessor({ responsePrefix: "result" }),
      speechProvider: speech,
      sendJson,
      sendBinary,
      closeSocket,
    });

    session.handleOpen();
    await session.handleMessage(
      JSON.stringify({
        type: "start",
        speechEndDetection: { mode: "auto" },
      })
    );
    transcription.triggerSpeechEnd({ reason: "silence" });
    await Promise.resolve();
    await Promise.resolve();

    expect(sendJson).toHaveBeenCalledWith(
      expect.objectContaining({ type: "tts.start" })
    );

    transcription.triggerPartial("new words");

    expect(sendJson).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "tts.end",
        data: expect.objectContaining({ interrupted: true }),
      })
    );

    speech.close();
  });

  class ControlledAgentProcessor implements AgentProcessor {
    private pending:
      | {
          resolve: () => void;
          send: (event: any) => void;
          transcript: string;
        }
      | null = null;

    async process({
      transcript,
      send,
    }: Parameters<AgentProcessor["process"]>[0]) {
      return new Promise<void>((resolve) => {
        this.pending = { resolve, send, transcript };
      });
    }

    async flush(responseText?: string) {
      if (!this.pending) {
        return;
      }
      await this.pending.send({
        type: "complete",
        data: {
          responseText: responseText ?? `response:${this.pending.transcript}`,
        },
      });
      this.pending.resolve();
      this.pending = null;
    }
  }

  it("skips complete events from overlapping turns", async () => {
    const sendJson = vi.fn();
    const sendBinary = vi.fn();
    const closeSocket = vi.fn();

    const transcription = new MockTranscriptionProvider({
      transcript: "first turn",
    });

    const agent = new ControlledAgentProcessor();

    const session = new VoiceSession({
      userId: "user-4",
      transcriptionProvider: transcription,
      agentProcessor: agent,
      speechProvider: new MockSpeechProvider(),
      sendJson,
      sendBinary,
      closeSocket,
    });

    session.handleOpen();
    await session.handleMessage(
      JSON.stringify({
        type: "start",
        speechEndDetection: { mode: "auto" },
      })
    );

    transcription.triggerSpeechEnd({ reason: "silence" });
    await Promise.resolve();
    await Promise.resolve();

    transcription.triggerPartial("second");

    await agent.flush("first-response");

    const completeEvents = sendJson.mock.calls.filter(
      ([payload]) => payload?.type === "complete"
    );
    expect(completeEvents.length).toBe(0);
    const ttsStartEvents = sendJson.mock.calls.filter(
      ([payload]) => payload?.type === "tts.start"
    );
    expect(ttsStartEvents.length).toBe(0);

    const partialEvents = sendJson.mock.calls.filter(
      ([payload]) => payload?.type === "transcript.partial"
    );
    expect(partialEvents.length).toBeGreaterThan(0);
  });
});
