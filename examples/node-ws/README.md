# usevoiceai Node WebSocket Example

This sample spins up a Node.js WebSocket server using the `@usevoiceai/server` Node adapter with Deepgram for STT, Cartesia for TTS, and a simple Gemini-based agent.

## Prerequisites

1. Install dependencies inside this folder:
   ```bash
   cd usevoice/examples/node-ws
   bun install
   ```
2. Export the required environment variables:
   ```bash
   export DEEPGRAM_API_KEY=...
   export CARTESIA_API_KEY=...
   export CARTESIA_VOICE_ID=...   # optional, will fall back to Cartesia default voice if omitted
   export GOOGLE_GENERATIVE_AI_API_KEY=...
   export PORT=8788               # optional
   ```

## Run the server

```bash
bun run dev
```

The server listens on `PORT` (default `8788`) and exposes:

- `GET /health` for a quick readiness check
- `ws://localhost:PORT/voice-command/ws?userId=<id>` for voice sessions

Point the React/Vue demos at that WebSocket URL to exercise the full pipeline.
