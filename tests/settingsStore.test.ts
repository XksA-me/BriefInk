import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { SettingsStore } from "../src/main/settingsStore.js";
import { makeTempDir } from "./helpers/tempPath.js";

describe("SettingsStore", () => {
  it("creates defaults, deep-merges updates, and persists them", () => {
    const temp = makeTempDir();
    try {
      const store = new SettingsStore(temp.path("nested", "settings.json"));

      const defaults = store.get();
      expect(defaults.hotkey).toBe("Option+Space");
      expect(defaults.localApi.apiKey).toMatch(/^briefink_[a-f0-9]{36}$/);

      const updated = store.update({
        language: { outputLanguage: "zh" },
        history: { saveHistory: true },
        localApi: { enabled: true, port: 19001 }
      });

      expect(updated.language.recognitionLanguage).toBe("auto");
      expect(updated.language.outputLanguage).toBe("zh");
      expect(updated.history.saveHistory).toBe(true);
      expect(updated.history.retentionDays).toBe(30);
      expect(updated.localApi.enabled).toBe(true);
      expect(updated.localApi.host).toBe("127.0.0.1");
      expect(updated.localApi.port).toBe(19001);

      const reloaded = new SettingsStore(temp.path("nested", "settings.json"));
      expect(reloaded.get()).toEqual(updated);
    } finally {
      temp.cleanup();
    }
  });

  it("returns cloned settings and regenerates API keys without mutating callers", () => {
    const temp = makeTempDir();
    try {
      const store = new SettingsStore(temp.path("settings.json"));
      const first = store.get();
      first.localApi.apiKey = "caller-mutated";

      expect(store.get().localApi.apiKey).not.toBe("caller-mutated");

      const oldKey = store.get().localApi.apiKey;
      const updated = store.regenerateApiKey();

      expect(updated.localApi.apiKey).not.toBe(oldKey);
      expect(updated.localApi.apiKey).toMatch(/^briefink_[a-f0-9]{36}$/);
      expect(JSON.parse(readFileSync(temp.path("settings.json"), "utf8")).localApi.apiKey).toBe(updated.localApi.apiKey);
    } finally {
      temp.cleanup();
    }
  });
});
