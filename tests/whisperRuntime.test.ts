import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getWhisperRuntimePath } from "../src/main/whisperRuntime.js";

describe("whisper runtime", () => {
  it("discovers the bundled development runtime when prepared", async () => {
    const runtimePath = await getWhisperRuntimePath();

    expect(runtimePath).toBeTruthy();
    expect(existsSync(runtimePath!)).toBe(true);
  });
});
