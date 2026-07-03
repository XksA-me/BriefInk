import { describe, expect, it } from "vitest";
import { ModelManager } from "../src/main/modelManager.js";
import { MockTranscriptionProvider } from "../src/main/providers.js";

describe("MockTranscriptionProvider", () => {
  it("falls back to the default model when no modelId is provided", async () => {
    const models = new ModelManager();
    models.configure("custom-openai-compatible", { endpoint: "https://api.example.test", model: "custom" });
    models.setDefault("custom-openai-compatible");
    const provider = new MockTranscriptionProvider(models);

    const result = await provider.transcribe("/tmp/meeting.webm", {
      language: "auto",
      outputLanguage: "zh"
    });

    expect(result.modelId).toBe("custom-openai-compatible");
    expect(result.text).toContain("meeting.webm");
    expect(result.text).toContain("Custom OpenAI-compatible");
    expect(result.translatedText).toBeUndefined();
  });

  it("requires local models to be running or installed before transcription", async () => {
    const provider = new MockTranscriptionProvider(new ModelManager());

    await expect(
      provider.transcribe("/tmp/local.webm", {
        modelId: "whisper-large-v3-turbo-quantized",
        language: "en",
        outputLanguage: "same"
      })
    ).rejects.toThrow("Whisper Large v3 Turbo Quantized is not running.");
  });

  it("does not synthesize translatedText when the selected provider lacks translation support", async () => {
    const models = new ModelManager();
    models.configure("custom-openai-compatible", { endpoint: "https://api.example.test", model: "custom" });
    const provider = new MockTranscriptionProvider(models);

    const result = await provider.transcribe("/tmp/custom.webm", {
      modelId: "custom-openai-compatible",
      language: "en",
      outputLanguage: "zh"
    });

    expect(result.text).toContain("Custom OpenAI-compatible");
    expect(result.translatedText).toBeUndefined();
  });
});
