import { describe, expect, it } from "vitest";
import { cartesia } from "./cartesia";
import { CartesiaTtsStreamer } from "./cartesiaTtsStreamer";

describe("cartesia helper", () => {
  it("returns a TTS streamer instance", () => {
    const streamer = cartesia({ apiKey: "cartesia-key" });
    expect(streamer).toBeInstanceOf(CartesiaTtsStreamer);
  });
});
