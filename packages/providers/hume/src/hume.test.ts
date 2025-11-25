import { describe, expect, it } from "vitest";
import { hume } from "./hume";
import { HumeSpeechProvider } from "./humeSpeechProvider";

describe("hume helper", () => {
  it("returns a Hume speech provider", () => {
    const provider = hume({ apiKey: "hume-key" });
    expect(provider).toBeInstanceOf(HumeSpeechProvider);
  });
});
