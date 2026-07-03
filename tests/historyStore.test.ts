import { describe, expect, it } from "vitest";
import { HistoryStore } from "../src/main/historyStore.js";
import type { HistoryEntry } from "../src/shared/types.js";
import { makeTempDir } from "./helpers/tempPath.js";

function historyEntry(id: string): HistoryEntry {
  return {
    id,
    createdAt: `2026-07-02T00:00:${id.padStart(2, "0")}.000Z`,
    duration: Number(id),
    modelId: "whisper-large-v3-turbo-quantized",
    modelName: "Whisper Large v3 Turbo Quantized",
    recognitionLanguage: "auto",
    outputLanguage: "same",
    text: `Transcript ${id}`,
    status: "success"
  };
}

describe("HistoryStore", () => {
  it("prepends entries, persists them, and protects internal state from callers", () => {
    const temp = makeTempDir();
    try {
      const store = new HistoryStore(temp.path("history.json"));
      store.add(historyEntry("1"));
      store.add(historyEntry("2"));

      const listed = store.list();
      expect(listed.map((entry) => entry.id)).toEqual(["2", "1"]);

      listed[0].text = "caller-mutated";
      expect(store.list()[0].text).toBe("Transcript 2");

      const reloaded = new HistoryStore(temp.path("history.json"));
      expect(reloaded.list().map((entry) => entry.id)).toEqual(["2", "1"]);
    } finally {
      temp.cleanup();
    }
  });

  it("deletes, clears, and caps history at 200 entries", () => {
    const temp = makeTempDir();
    try {
      const store = new HistoryStore(temp.path("history.json"));

      for (let index = 1; index <= 205; index += 1) {
        store.add(historyEntry(String(index)));
      }

      expect(store.list()).toHaveLength(200);
      expect(store.list()[0].id).toBe("205");
      expect(store.list().at(-1)?.id).toBe("6");

      expect(store.delete("205")[0].id).toBe("204");
      expect(store.list()).toHaveLength(199);
      expect(store.clear()).toEqual([]);
      expect(new HistoryStore(temp.path("history.json")).list()).toEqual([]);
    } finally {
      temp.cleanup();
    }
  });

  it("updates text fields and deletes multiple records", () => {
    const temp = makeTempDir();
    try {
      const store = new HistoryStore(temp.path("history.json"));
      store.add(historyEntry("1"));
      store.add(historyEntry("2"));
      store.add(historyEntry("3"));

      const updated = store.update("2", { text: "Edited transcript", translatedText: "Edited translation" });
      expect(updated.find((entry) => entry.id === "2")?.text).toBe("Edited transcript");
      expect(updated.find((entry) => entry.id === "2")?.translatedText).toBe("Edited translation");

      const remaining = store.deleteMany(["1", "3"]);
      expect(remaining.map((entry) => entry.id)).toEqual(["2"]);
      expect(new HistoryStore(temp.path("history.json")).list().map((entry) => entry.id)).toEqual(["2"]);
    } finally {
      temp.cleanup();
    }
  });
});
