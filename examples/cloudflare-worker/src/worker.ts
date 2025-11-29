import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { cartesia } from "@usevoiceai/cartesia";
import { deepgram } from "@usevoiceai/deepgram";
import { AgentProcessor, createVoiceDurableObject } from "@usevoiceai/server";
import { generateText, type ModelMessage } from "ai";

interface Env {
  VOICE_SESSION: DurableObjectNamespace;
  DEEPGRAM_API_KEY: string;
  CARTESIA_API_KEY: string;
  CARTESIA_VOICE_ID: string;
  GOOGLE_GENERATIVE_AI_API_KEY: string;
}

class MockAgentProcessor implements AgentProcessor {
  private conversationHistory: ModelMessage[] = [];

  constructor(private env: Env) {}

  async process({
    transcript,
    excludeFromConversation = () => false,
  }: Parameters<AgentProcessor["process"]>[0]) {
    try {
      const google = createGoogleGenerativeAI({
        apiKey: this.env.GOOGLE_GENERATIVE_AI_API_KEY,
      });

      const { text } = await generateText({
        model: google("gemini-3-pro-preview"),
        system:
          "Be concise and direct. Answer briefly without unnecessary elaboration. But don't loose the conversation style.",
        messages: [
          ...this.conversationHistory,
          { role: "user", content: transcript },
        ],
      });

      if (!excludeFromConversation()) {
        this.conversationHistory.push({
          role: "user",
          content: transcript,
        });

        this.conversationHistory.push({
          role: "assistant",
          content: text,
        });
      }
      return text;
    } catch (error) {
      console.error("Error generating text", error);
      return {
        responseText: "Something went wrong, please try again.",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}

const VoiceSessionDO = createVoiceDurableObject<Env>({
  transcription: (env) => deepgram("nova-3", { apiKey: env.DEEPGRAM_API_KEY }),
  agent: (env) => new MockAgentProcessor(env),
  speech: (env) => cartesia("sonic-3", { apiKey: env.CARTESIA_API_KEY }),
});

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);

    if (url.pathname === "/voice-command/ws") {
      const userId = url.searchParams.get("userId") ?? "demo-user";
      const id = env.VOICE_SESSION.newUniqueId();
      const stub = env.VOICE_SESSION.get(id);

      const headers = new Headers(request.headers);
      headers.set("X-Voice-User", JSON.stringify({ id: userId }));

      return stub.fetch(new Request(request, { headers }));
    }

    if (url.pathname === "/health") {
      return new Response(
        JSON.stringify({
          ok: true,
          message: "useVoice worker running",
        }),
        { headers: { "content-type": "application/json" } }
      );
    }

    return new Response("Not found", { status: 404 });
  },
};

export { VoiceSessionDO };
