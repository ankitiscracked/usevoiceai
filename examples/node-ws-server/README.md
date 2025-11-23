# Node.js WebSocket Server Example

This example demonstrates how to set up a Node.js WebSocket server using the `ws` package with the `@usevoiceai/server` library. It provides a complete voice assistant implementation that works with the React demo app.

## Features

- WebSocket server using the `ws` package
- Integration with Deepgram for speech-to-text
- Integration with Cartesia for text-to-speech
- Integration with Google Generative AI for agent processing
- Ready to work with the React demo app in `examples/react-demo`
- Health check endpoint
- Graceful shutdown handling
- CORS support for local development

## Prerequisites

Before running this example, you need to obtain API keys from:

- [Deepgram](https://deepgram.com/) - For speech transcription
- [Cartesia](https://cartesia.ai/) - For speech synthesis
- [Google AI Studio](https://makersuite.google.com/app/apikey) - For Google Generative AI (Gemini)

## Installation

1. Navigate to the example directory:

```bash
cd examples/node-ws-server
```

2. Install dependencies:

```bash
npm install
```

3. Create a `.env` file with your API keys:

```bash
cp .env.example .env
```

4. Edit the `.env` file and add your API keys:

```env
DEEPGRAM_API_KEY=your_deepgram_api_key
CARTESIA_API_KEY=your_cartesia_api_key
CARTESIA_VOICE_ID=your_cartesia_voice_id
GOOGLE_GENERATIVE_AI_API_KEY=your_google_ai_api_key
PORT=8080
```

## Running the Server

### Development Mode

Run the server with auto-reload:

```bash
npm run dev
```

### Production Mode

Build and run the server:

```bash
npm run build
npm start
```

The server will start on `http://localhost:8080` by default.

## Endpoints

### HTTP Endpoints

- `GET /` - Server information page
- `GET /health` - Health check endpoint

### WebSocket Endpoint

- `ws://localhost:8080/voice-command/ws?userId={userId}` - Voice command WebSocket connection

## Using with the React Demo App

1. Start this Node.js WebSocket server:

```bash
npm run dev
```

2. In a separate terminal, navigate to the React demo:

```bash
cd ../react-demo
```

3. Update the WebSocket URL in the React app to point to this server:

```typescript
// In react-demo/src/App.tsx or similar
const wsUrl = "ws://localhost:8080/voice-command/ws";
```

4. Start the React demo:

```bash
npm run dev
```

5. Open your browser and navigate to the React app (usually `http://localhost:5173`)

## Architecture

This example uses the following components from the `@usevoiceai` packages:

- `@usevoiceai/server` - Server-side WebSocket handling and session management
- `@usevoiceai/deepgram` - Deepgram transcription provider
- `@usevoiceai/cartesia` - Cartesia speech synthesis provider
- `@usevoiceai/core` - Core types and interfaces

### Key Files

- `src/server.ts` - Main server implementation
- `package.json` - Dependencies and scripts
- `tsconfig.json` - TypeScript configuration

## How It Works

1. The server creates an HTTP server and attaches a WebSocket server to it
2. When a client connects to `/voice-command/ws`, the server:
   - Extracts the `userId` from the query parameters
   - Initializes transcription, agent, and speech providers
   - Creates a voice session for that user
3. The voice session handles:
   - Audio input from the client (transcription)
   - Processing the transcript with the AI agent
   - Generating speech output
   - Sending the audio response back to the client

## Customization

### Changing the AI Model

Edit the `MockAgentProcessor` class in `src/server.ts`:

```typescript
const { text } = await generateText({
  model: google("gemini-3-pro-preview"), // Change this to use a different model
  system: "Your custom system prompt here",
  messages: [...this.conversationHistory, { role: "user", content: transcript }],
});
```

### Adding Custom Middleware

You can add custom logic in the `getUserId` function:

```typescript
registerNodeWebSocketServer({
  server: wss,
  getUserId: ({ request }) => {
    // Add authentication logic here
    const token = request.headers.authorization;
    // Validate token and extract userId
    return userId;
  },
  // ...
});
```

### Session Callbacks

Use the `onSessionStart` and `onSessionEnd` callbacks for logging or analytics:

```typescript
registerNodeWebSocketServer({
  // ...
  onSessionStart: ({ userId, session }) => {
    console.log(`Session started for ${userId}`);
    // Add your custom logic
  },
  onSessionEnd: ({ userId }) => {
    console.log(`Session ended for ${userId}`);
    // Add your custom logic
  },
});
```

## Troubleshooting

### WebSocket Connection Issues

If the React app can't connect to the WebSocket server:

1. Make sure the server is running
2. Check that the WebSocket URL in the React app matches the server URL
3. Verify that CORS is enabled (it is by default in this example)
4. Check the browser console for connection errors

### API Key Issues

If you get errors about missing API keys:

1. Verify that the `.env` file exists and contains all required keys
2. Restart the server after updating the `.env` file
3. Check the server startup logs to see which keys are detected

### Port Already in Use

If you get an EADDRINUSE error:

1. Change the PORT in your `.env` file
2. Or stop the process using that port: `lsof -ti:8080 | xargs kill`

## License

This example is part of the @usevoiceai project.
