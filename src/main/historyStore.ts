import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { HistoryEntry } from "../shared/types.js";

export class HistoryStore {
  private entries: HistoryEntry[];

  constructor(private readonly filePath: string) {
    this.entries = this.load();
  }

  list(): HistoryEntry[] {
    return clone(this.entries);
  }

  add(entry: HistoryEntry): HistoryEntry[] {
    this.entries = [normalizeEntry(entry), ...this.entries].slice(0, 200);
    this.save();
    return this.list();
  }

  delete(id: string): HistoryEntry[] {
    this.entries = this.entries.filter((entry) => entry.id !== id);
    this.save();
    return this.list();
  }

  deleteMany(ids: string[]): HistoryEntry[] {
    const selected = new Set(ids);
    this.entries = this.entries.filter((entry) => !selected.has(entry.id));
    this.save();
    return this.list();
  }

  update(id: string, patch: Pick<Partial<HistoryEntry>, "text" | "translatedText">): HistoryEntry[] {
    this.entries = this.entries.map((entry) => {
      if (entry.id !== id) return entry;
      return normalizeEntry({
        ...entry,
        ...patch,
        updatedAt: new Date().toISOString()
      });
    });
    this.save();
    return this.list();
  }

  clear(): HistoryEntry[] {
    this.entries = [];
    this.save();
    return [];
  }

  private save(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.entries, null, 2), "utf8");
  }

  private load(): HistoryEntry[] {
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, "utf8"));
      return Array.isArray(parsed) ? parsed.filter(isHistoryEntry).map(normalizeEntry) : [];
    } catch {
      return [];
    }
  }
}

function normalizeEntry(entry: HistoryEntry): HistoryEntry {
  return {
    ...entry,
    updatedAt: entry.updatedAt ?? entry.createdAt,
    targets: entry.targets ?? [],
    audioPath: entry.audioPath ?? undefined
  };
}

function isHistoryEntry(value: unknown): value is HistoryEntry {
  if (!value || typeof value !== "object") {
    return false;
  }

  const entry = value as Partial<HistoryEntry>;
  return (
    typeof entry.id === "string" &&
    typeof entry.createdAt === "string" &&
    typeof entry.duration === "number" &&
    typeof entry.modelId === "string" &&
    typeof entry.modelName === "string" &&
    typeof entry.text === "string" &&
    (entry.status === "success" || entry.status === "error")
  );
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
