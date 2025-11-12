import type { TranscriptionProvider } from "@usevoice/server";
import {
  DeepgramTranscriptionProvider,
  type DeepgramProviderConfig
} from "./deepgramTranscriptionProvider";

export type DeepgramOptions = DeepgramProviderConfig;

/**
 * Declarative helper that hides the Deepgram provider class behind a simple function.
 * Pair it with `createVoiceWebSocketSession({ transcription: deepgram({ ... }) })`.
 */
export function deepgram(options: DeepgramOptions): TranscriptionProvider {
  return new DeepgramTranscriptionProvider(options);
}
