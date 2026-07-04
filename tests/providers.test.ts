import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ModelManager } from "../src/main/modelManager.js";
import { MockTranscriptionProvider, SiliconFlowTranscriptionProvider } from "../src/main/providers.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

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
    expect(result.text).toContain("Third-party Speech API");
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

    expect(result.text).toContain("Third-party Speech API");
    expect(result.translatedText).toBeUndefined();
  });
});

describe("SiliconFlowTranscriptionProvider", () => {
  it("posts multipart audio to SiliconFlow transcription endpoint and parses text", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "briefink-siliconflow-"));
    const audioPath = join(tempDir, "audio.webm");
    await writeFile(audioPath, "test audio");
    const requests: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal("fetch", async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ text: "你好，BriefInk" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    });

    const provider = new SiliconFlowTranscriptionProvider(
      {
        provider: "siliconflow",
        apiKey: "sf_test_key",
        model: "FunAudioLLM/SenseVoiceSmall"
      },
      "custom-openai-compatible"
    );

    try {
      const result = await provider.transcribe(audioPath, {
        modelId: "custom-openai-compatible",
        language: "zh",
        outputLanguage: "same"
      });

      expect(result).toMatchObject({
        text: "你好，BriefInk",
        model: "FunAudioLLM/SenseVoiceSmall",
        providerId: "siliconflow",
        task: "transcription"
      });
      expect(requests).toHaveLength(1);
      expect(requests[0].url).toBe("https://api.siliconflow.cn/v1/audio/transcriptions");
      expect((requests[0].init.headers as Record<string, string>).Authorization).toBe("Bearer sf_test_key");
      expect(requests[0].init.body).toBeInstanceOf(FormData);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
