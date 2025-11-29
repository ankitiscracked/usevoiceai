import { useEffect } from "react";
import { useAudioPlayer } from "./useAudioPlayer";
import { SpeechStream } from "@usevoiceai/core";

export function useSpeech({
  speechStream,
}: {
  speechStream: SpeechStream | null;
}) {
  const audio = useAudioPlayer();

  useEffect(() => {
    if (!speechStream) {
      return;
    }
    let isCancelled = false;
    const stream = speechStream;
    const iterator = stream[Symbol.asyncIterator]();
    let hasReleased = false;
    const releaseStream = () => {
      if (hasReleased) {
        return;
      }
      hasReleased = true;
      stream.release?.();
    };

    (async () => {
      try {
        await audio.start();
        while (!isCancelled) {
          const { value, done } = await iterator.next();
          if (done || !value) {
            break;
          }
          const magnitude = await audio.addChunk(value);
          if (typeof magnitude === "number") {
          }
        }
        audio.finish();
        await audio.waitUntilIdle();
        if (!isCancelled) {
        }
      } catch (error) {
        console.warn("Unable to play TTS audio", error);
        audio.finish(true);
      } finally {
        releaseStream();
      }
    })();

    return () => {
      isCancelled = true;
      iterator.return?.();
      releaseStream();
      audio.reset();
    };
  }, [speechStream, audio]);

  return {
    stop: audio.reset,
  };
}
