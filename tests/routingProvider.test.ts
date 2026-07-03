import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ModelManager } from "../src/main/modelManager.js";
import { createTranscriptionProvider } from "../src/main/providers.js";
import { transcribeWithWhisperCpp } from "../src/main/whisperRuntime.js";
import { makeTempDir } from "./helpers/tempPath.js";

vi.mock("../src/main/whisperRuntime.js", async () => {
  const actual = await vi.importActual<typeof import("../src/main/whisperRuntime.js")>("../src/main/whisperRuntime.js");
  return {
    ...actual,
    downloadFile: vi.fn(async (_url: string, destination: string) => {
      mkdirSync(dirname(destination), { recursive: true });
      writeFileSync(destination, "fake model file");
    }),
    hasWhisperCppRuntime: vi.fn(async () => true),
    transcribeWithWhisperCpp: vi.fn(async (model) => ({
      text: "real whisper transcript",
      modelId: model.id,
      providerId: "whisper.cpp"
    }))
  };
});

describe("RoutingTranscriptionProvider", () => {
  it("routes installed local whisper.cpp models to the real whisper runtime", async () => {
    const temp = makeTempDir();
    try {
      const models = new ModelManager(temp.path("models"));
      const model = models.getDefault();
      if (!model.localPath) throw new Error("Expected local path for default model");
      mkdirSync(dirname(model.localPath), { recursive: true });
      writeFileSync(model.localPath, "fake model file");
      await models.start(model.id);

      const provider = createTranscriptionProvider(models);
      const result = await provider.transcribe(temp.path("sample.wav"), {
        language: "en",
        outputLanguage: "same"
      });

      expect(transcribeWithWhisperCpp).toHaveBeenCalledOnce();
      expect(result).toMatchObject({
        text: "real whisper transcript",
        modelId: model.id,
        providerId: "whisper.cpp"
      });
    } finally {
      temp.cleanup();
      vi.clearAllMocks();
    }
  });
});
