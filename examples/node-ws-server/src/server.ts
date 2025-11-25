import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { cartesia } from "@usevoiceai/cartesia";
import { deepgram } from "@usevoiceai/deepgram";
import {
  registerNodeWebSocketServer,
  type AgentProcessor,
} from "@usevoiceai/server";
import { generateText, type ModelMessage } from "ai";
import { createServer } from "http";
import { WebSocketServer } from "ws";

// Environment configuration
const config = {
  DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY || "",
  CARTESIA_API_KEY: process.env.CARTESIA_API_KEY || "",
  CARTESIA_VOICE_ID: process.env.CARTESIA_VOICE_ID || "",
  GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY || "",
  PORT: parseInt(process.env.PORT || "8080", 10),
};

// Agent processor implementation
class MockAgentProcessor implements AgentProcessor {
  private conversationHistory: ModelMessage[] = [];

  async process({
    transcript,
    send,
    excludeFromConversation = () => false,
  }: Parameters<AgentProcessor["process"]>[0]) {
    try {
      const google = createGoogleGenerativeAI({
        apiKey: config.GOOGLE_GENERATIVE_AI_API_KEY,
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

      await send({
        type: "complete",
        data: {
          responseText: text,
        },
      });
    } catch (error) {
      console.error("Error generating text", error);
      await send({
        type: "error",
        data: {
          error: error instanceof Error ? error.message : "Unknown error",
        },
      });
    }
  }
}

// Create HTTP server
const httpServer = createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);

  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        message: "useVoice Node.js server running",
      })
    );
    return;
  }

  // Enable CORS for React app
  res.writeHead(200, {
    "Content-Type": "text/html",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(`
<!DOCTYPE html>
<html>
<head>
  <title>useVoice Node.js WebSocket Server</title>
</head>
<body>
  <h1>useVoice Node.js WebSocket Server</h1>
  <p>Server is running. WebSocket endpoint: <code>ws://localhost:${config.PORT}/voice-command/ws</code></p>
  <h2>Health Check</h2>
  <p><a href="/health">Check server health</a></p>
  <h2>Configuration</h2>
  <ul>
    <li>DEEPGRAM_API_KEY: ${config.DEEPGRAM_API_KEY ? "✓ Set" : "✗ Not set"}</li>
    <li>CARTESIA_API_KEY: ${config.CARTESIA_API_KEY ? "✓ Set" : "✗ Not set"}</li>
    <li>GOOGLE_GENERATIVE_AI_API_KEY: ${config.GOOGLE_GENERATIVE_AI_API_KEY ? "✓ Set" : "✗ Not set"}</li>
  </ul>
  <h2>React Example App</h2>
  <p>To use with the React example app:</p>
  <ol>
    <li>Navigate to <code>examples/react-demo</code></li>
    <li>Update the WebSocket URL to point to this server</li>
    <li>Run <code>npm run dev</code> in the react-demo directory</li>
  </ol>
</body>
</html>
  `);
});

// Create WebSocket server
const wss = new WebSocketServer({
  server: httpServer,
  path: "/voice-command/ws"
});

// Register voice session handler
registerNodeWebSocketServer({
  server: wss,
  getUserId: ({ request }) => {
    const url = new URL(request.url || "/", `http://${request.headers.host}`);
    const userId = url.searchParams.get("userId") || "demo-user";
    return userId;
  },
  providers: {
    transcription: () => deepgram("nova-3", { apiKey: config.DEEPGRAM_API_KEY }),
    agent: () => new MockAgentProcessor(),
    speech: () => cartesia("sonic-3", { apiKey: config.CARTESIA_API_KEY }),
  },
  onSessionStart: ({ userId }) => {
    console.log(`[Voice Session] Started for user: ${userId}`);
  },
  onSessionEnd: ({ userId }) => {
    console.log(`[Voice Session] Ended for user: ${userId}`);
  },
});

// Start the server
httpServer.listen(config.PORT, () => {
  console.log(`
🚀 useVoice Node.js WebSocket Server is running!

Server listening on:
  - HTTP: http://localhost:${config.PORT}
  - WebSocket: ws://localhost:${config.PORT}/voice-command/ws

Health check: http://localhost:${config.PORT}/health

Configuration status:
  - DEEPGRAM_API_KEY: ${config.DEEPGRAM_API_KEY ? "✓" : "✗"}
  - CARTESIA_API_KEY: ${config.CARTESIA_API_KEY ? "✓" : "✗"}
  - GOOGLE_GENERATIVE_AI_API_KEY: ${config.GOOGLE_GENERATIVE_AI_API_KEY ? "✓" : "✗"}

${!config.DEEPGRAM_API_KEY || !config.CARTESIA_API_KEY || !config.GOOGLE_GENERATIVE_AI_API_KEY ? "\n⚠️  Warning: Some API keys are missing. Please set them in your .env file.\n" : ""}
Press Ctrl+C to stop the server.
  `);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM signal received: closing HTTP server");
  httpServer.close(() => {
    console.log("HTTP server closed");
  });
});

process.on("SIGINT", () => {
  console.log("\nSIGINT signal received: closing HTTP server");
  httpServer.close(() => {
    console.log("HTTP server closed");
    process.exit(0);
  });
});
