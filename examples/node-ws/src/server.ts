import http from "http";
import { WebSocketServer } from "ws";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { cartesia } from "@usevoiceai/cartesia";
import { deepgram } from "@usevoiceai/deepgram";
import {
  type AgentProcessor,
  registerNodeWebSocketServer,
} from "@usevoiceai/server";
import { generateText, type ModelMessage } from "ai";

const PORT = Number(process.env.PORT ?? 8788);

class DemoAgent implements AgentProcessor {
  private conversationHistory: ModelMessage[] = [];

  constructor(private apiKey: string) {}

  async process({
    transcript,
    excludeFromConversation = () => false,
  }: Parameters<AgentProcessor["process"]>[0]) {
    try {
      const google = createGoogleGenerativeAI({
        apiKey: this.apiKey,
      });

      const { text } = await generateText({
        model: google("gemini-3-pro-preview"),
        system:
          "Be concise and direct. Answer briefly without unnecessary elaboration. Keep a conversational style.",
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

function requiredEnv(key: string) {
  const value = process.env[key];
  if (!value) {
    throw new Error(`${key} is required`);
  }
  return value;
}

const wss = new WebSocketServer({ noServer: true });

registerNodeWebSocketServer({
  server: wss,
  getUserId: ({ request }) => {
    const url = new URL(
      request.url ?? "/voice-command/ws",
      `http://${request.headers.host ?? `localhost:${PORT}`}`
    );
    return url.searchParams.get("userId") ?? "demo-user";
  },
  providers: {
    transcription: () =>
      deepgram("nova-3", { apiKey: requiredEnv("DEEPGRAM_API_KEY") }),
    agent: () => new DemoAgent(requiredEnv("GOOGLE_GENERATIVE_AI_API_KEY")),
    speech: () =>
      cartesia("sonic-3", {
        apiKey: requiredEnv("CARTESIA_API_KEY"),
        voiceId: process.env.CARTESIA_VOICE_ID,
      }),
  },
  onSessionStart: ({ userId }) =>
    console.log(`[voice] session started for user ${userId}`),
  onSessionEnd: ({ userId }) =>
    console.log(`[voice] session ended for user ${userId}`),
});

const server = http.createServer((req, res) => {
  if (!req.url) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, message: "missing url" }));
    return;
  }

  const url = new URL(
    req.url,
    `http://${req.headers.host ?? `localhost:${PORT}`}`
  );

  if (url.pathname === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, message: "usevoice Node WS running" }));
    return;
  }

  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ ok: false, message: "not found" }));
});

server.on("upgrade", (request, socket, head) => {
  const url = new URL(
    request.url ?? "/voice-command/ws",
    `http://${request.headers.host ?? `localhost:${PORT}`}`
  );

  if (url.pathname !== "/voice-command/ws") {
    socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request);
  });
});

server.listen(PORT, () => {
  console.log(
    `[voice] listening on http://localhost:${PORT} (ws path: /voice-command/ws)`
  );
});
