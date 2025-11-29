import { describe, expect, it, vi } from "vitest";
import type {
  AgentProcessor,
  TranscriptionProvider,
  TranscriptStream,
  SpeechProvider,
  SpeechStream,
} from "../types";
import { createVoiceSession } from "./declarativeVoiceSession";

class ControlledTranscriptionProvider implements TranscriptionProvider {
  private listeners: {
    onTranscript: (event: { transcript: string; isFinal: boolean }) => void;
    onError: (error: Error) => void;
  } | null = null;

  async createStream(
    options: Parameters<TranscriptionProvider["createStream"]>[0]
  ): Promise<TranscriptStream> {
    this.listeners = {
      onTranscript: options.onTranscript,
      onError: options.onError,
    };

    const transcriptStream: AsyncIterable<any> = {
      [Symbol.asyncIterator]() {
        return {
          async next() {
            return { value: undefined, done: true };
          },
        };
      },
    };

    return {
      send: vi.fn(),
      finish: async () => {},
      abort: vi.fn(),
      [Symbol.asyncIterator]() {
        return transcriptStream[Symbol.asyncIterator]();
      },
    };
  }

  emitPartial(text: string) {
    this.listeners?.onTranscript({ transcript: text, isFinal: false });
  }

  emitFinal(text: string) {
    this.listeners?.onTranscript({ transcript: text, isFinal: true });
  }

  throw(error: Error) {
    this.listeners?.onError(error);
  }
}

class InstantAgentProcessor implements AgentProcessor {
  async process({
    transcript,
  }: Parameters<AgentProcessor["process"]>[0]) {
    return { responseText: `agent:${transcript}` };
  }
}

class ChunkingTtsStreamer implements SpeechProvider {
  async send(
    text: string,
    handlers: Parameters<SpeechProvider["send"]>[1]
  ): Promise<SpeechStream> {
    const buffer = new TextEncoder().encode(text).buffer;
    handlers.onAudioChunk(buffer);
    handlers.onClose();

    let emitted = false;
    const speechStream: SpeechStream = {
      [Symbol.asyncIterator]() {
        return {
          next() {
            if (!emitted) {
              emitted = true;
              return Promise.resolve({ value: buffer, done: false });
            }
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

describe("createVoiceWebSocketSession", () => {
  it("exposes command handles with text, agent, and speech streams", async () => {
    const transcription = new ControlledTranscriptionProvider();
    const agent = new InstantAgentProcessor();
    const tts = new ChunkingTtsStreamer();

    const sentEvents: VoiceSocketEvent[] = [];
    const binaryChunks: ArrayBuffer[] = [];

    const session = createVoiceSession({
      userId: "user-1",
      providers: {
        transcription,
        agent,
        speech: tts,
      },
      transport: {
        sendJson: (payload) => {
          sentEvents.push(payload);
        },
        sendBinary: (chunk) => {
          binaryChunks.push(chunk);
        },
        close: vi.fn(),
      },
    });

    const commandsIterator = session.commands()[Symbol.asyncIterator]();
    const nextCommand = commandsIterator.next();

    await session.handleOpen();
    await session.handleMessage(JSON.stringify({ type: "start" }));

    const command = (await nextCommand).value;
    expect(command).toBeDefined();

    const collectedText: string[] = [];
    const consumeText = (async () => {
      for await (const chunk of command!.text.stream()) {
        collectedText.push(chunk);
      }
    })();

    const collectedSpeech: ArrayBuffer[] = [];
    const consumeSpeech = (async () => {
      for await (const chunk of command!.speech.stream()) {
        collectedSpeech.push(chunk);
      }
    })();

    transcription.emitPartial("hello");
    transcription.emitFinal("hello world");

    await session.handleMessage(JSON.stringify({ type: "end" }));

    await consumeText;
    await consumeSpeech;

    const finalTranscript = await command!.text.final;
    expect(finalTranscript?.transcript).toBe("hello world");

    expect(collectedText).toEqual(["hello", "hello world"]);
    expect(collectedSpeech).toHaveLength(1);
    expect(new TextDecoder().decode(collectedSpeech[0])).toBe(
      "agent:hello world"
    );

    const completeEvent = sentEvents.find((evt) => evt.type === "complete");
    expect(completeEvent?.data?.responseText).toBe("agent:hello world");
    expect(binaryChunks).toHaveLength(1);
  });

  it("resolves final transcript as null when the command is cancelled", async () => {
    const transcription = new ControlledTranscriptionProvider();
    const agent: AgentProcessor = {
      process: vi.fn(),
    };

    const session = createVoiceSession({
      userId: "user-2",
      providers: {
        transcription,
        agent,
        speech: {
          stream: async () => {},
        } as SpeechProvider,
      },
      transport: {
        sendJson: vi.fn(),
        sendBinary: vi.fn(),
        close: vi.fn(),
      },
    });

    const iterator = session.commands()[Symbol.asyncIterator]();
    const pendingCommand = iterator.next();

    await session.handleMessage(JSON.stringify({ type: "start" }));
    const command = (await pendingCommand).value;

    await session.handleMessage(JSON.stringify({ type: "cancel" }));

    const finalTranscript = await command!.text.final;
    expect(finalTranscript).toBeNull();

    const streamValues: string[] = [];
    for await (const value of command!.text.stream()) {
      streamValues.push(value);
    }
    expect(streamValues).toEqual([]);
    expect(agent.process).not.toHaveBeenCalled();
  });
});
