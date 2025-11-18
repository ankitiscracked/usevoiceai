import { describe, expect, it } from "vitest";
import { cartesia } from "./cartesia";
import { CartesiaSpeechProvider } from "./cartesiaSpeechProvider";

describe("cartesia helper", () => {
  it("returns a TTS streamer instance", () => {
    const streamer = cartesia("sonic-3", { apiKey: "cartesia-key" });
    expect(streamer).toBeInstanceOf(CartesiaSpeechProvider);
  });
});
