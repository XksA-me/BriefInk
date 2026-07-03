import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ModelManager } from "../src/main/modelManager.js";
import { makeTempDir } from "./helpers/tempPath.js";

describe("ModelManager", () => {
  it("tracks defaults and returns cloned model lists", () => {
    const models = new ModelManager();

    expect(models.getDefault().id).toBe("whisper-large-v3-turbo-quantized");

    const listed = models.list();
    expect(listed.map((model) => model.id)).toEqual(["whisper-large-v3-turbo-quantized", "custom-openai-compatible"]);
    listed[0].name = "caller-mutated";
    expect(models.get("whisper-large-v3-turbo-quantized")?.name).toBe("Whisper Large v3 Turbo Quantized");

    const afterDefault = models.setDefault("custom-openai-compatible");
    expect(afterDefault.filter((model) => model.default)).toHaveLength(1);
    expect(models.getDefault().id).toBe("custom-openai-compatible");
  });

  it("configures cloud/custom providers and manages lifecycle state", async () => {
    const models = new ModelManager();

    expect(models.configure("custom-openai-compatible", { endpoint: "https://api.example.test", model: "whisper-1" })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "custom-openai-compatible",
          status: "installed",
          config: { endpoint: "https://api.example.test", model: "whisper-1" }
        })
      ])
    );

    await models.start("custom-openai-compatible");
    expect(models.get("custom-openai-compatible")).toMatchObject({ status: "running", managedByBriefInk: false });

    await models.stop("custom-openai-compatible");
    expect(models.get("custom-openai-compatible")).toMatchObject({ status: "stopped", managedByBriefInk: false });

    await expect(models.start("missing-model")).rejects.toThrow("Unknown model: missing-model");
  });

  it("persists default model and provider configuration without trusting stale running state", async () => {
      const temp = makeTempDir();
    try {
      const first = new ModelManager(temp.path("models"), temp.path("model-state.json"));
      first.setDefault("custom-openai-compatible");
      first.configure("custom-openai-compatible", { baseUrl: "https://api.example.test", apiKey: "test", model: "whisper-1" });
      await first.start("custom-openai-compatible");

      const second = new ModelManager(temp.path("models"), temp.path("model-state.json"));

      expect(second.getDefault().id).toBe("custom-openai-compatible");
      expect(second.get("custom-openai-compatible")).toMatchObject({
        status: "stopped",
        config: { baseUrl: "https://api.example.test", apiKey: "test", model: "whisper-1" },
        managedByBriefInk: false
      });
    } finally {
      temp.cleanup();
    }
  });

  it("migrates removed model defaults back to Large v3 Turbo", () => {
    const temp = makeTempDir();
    try {
      writeFileSync(
        temp.path("model-state.json"),
        JSON.stringify({
          defaultModelId: "base-multilingual",
          models: {}
        }),
        "utf8"
      );

      const models = new ModelManager(temp.path("models"), temp.path("model-state.json"));

      expect(models.getDefault().id).toBe("whisper-large-v3-turbo-quantized");
    } finally {
      temp.cleanup();
    }
  });
});
