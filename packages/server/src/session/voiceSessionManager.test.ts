import { describe, expect, it, vi } from "vitest";
import { VoiceSessionManager } from "./voiceSessionManager";
import {
  MockAgentProcessor,
  MockTranscriptionProvider,
  MockTtsStreamer
} from "../providers";

describe("VoiceSessionManager", () => {
  it("processes transcript and sends events", async () => {
    const sendJson = vi.fn();
    const sendBinary = vi.fn();
    const closeSocket = vi.fn();

    const session = new VoiceSessionManager({
      userId: "user-1",
      transcriptionProvider: new MockTranscriptionProvider({
        transcript: "hello world"
      }),
      agentProcessor: new MockAgentProcessor({ responsePrefix: "result" }),
      ttsStreamer: new MockTtsStreamer(),
      sendJson,
      sendBinary,
      closeSocket
    });

    session.handleOpen();
    await session.handleMessage(
      JSON.stringify({
        type: "start"
      })
    );
    await session.handleMessage(JSON.stringify({ type: "end" }));

    expect(sendJson).toHaveBeenCalledWith({ type: "command-started" });
    expect(sendJson).toHaveBeenCalledWith(
      expect.objectContaining({ type: "complete" })
    );
  });
});
