import type { TtsStreamer } from "@usevoice/server";
import {
  CartesiaTtsStreamer,
  type CartesiaTtsConfig
} from "./cartesiaTtsStreamer";

export type CartesiaOptions = CartesiaTtsConfig;

/**
 * Declarative helper that hides the Cartesia TTS streamer class behind a function.
 * Works seamlessly with `createVoiceWebSocketSession({ tts: cartesia({ ... }) })`.
 */
export function cartesia(options: CartesiaOptions): TtsStreamer {
  return new CartesiaTtsStreamer(options);
}
