import type { SpeechProvider } from "@usevoiceai/server";
import { HumeSpeechProvider, type HumeSpeechConfig } from "./humeSpeechProvider";

export type { HumeSpeechConfig, HumeVoiceConfig } from "./humeSpeechProvider";

/**
 * Declarative helper around the Hume TTS client to match other providers.
 */
export function hume(options?: HumeSpeechConfig): SpeechProvider {
  return new HumeSpeechProvider(options ?? {});
}
