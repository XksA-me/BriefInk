import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { AppSettings, SettingsPatch } from "../shared/types.js";

export const defaultSettings = (): AppSettings => ({
  hotkey: "Option+Space",
  language: {
    recognitionLanguage: "auto",
    outputLanguage: "same"
  },
  recording: {
    inputDeviceId: "default",
    maxDurationSeconds: 600,
    audioFormat: "webm"
  },
  output: {
    autoCopy: true,
    autoPaste: true,
    showNotification: true,
    copyTarget: "translation"
  },
  history: {
    saveHistory: false,
    saveAudio: false,
    audioDirectory: null,
    retentionDays: 30
  },
  localApi: {
    enabled: false,
    host: "127.0.0.1",
    port: 8765,
    apiKey: `briefink_${randomBytes(18).toString("hex")}`,
    openAiCompatible: true
  },
  appearance: {
    language: "en"
  },
  autoStartDefaultModel: false
});

export class SettingsStore {
  private settings: AppSettings;

  constructor(private readonly filePath: string) {
    this.settings = this.load();
  }

  get(): AppSettings {
    return clone(this.settings);
  }

  update(patch: SettingsPatch): AppSettings {
    this.settings = {
      ...this.settings,
      ...patch,
      language: { ...this.settings.language, ...patch.language },
      recording: { ...this.settings.recording, ...patch.recording },
      output: { ...this.settings.output, ...patch.output },
      history: { ...this.settings.history, ...patch.history },
      localApi: { ...this.settings.localApi, ...patch.localApi }
    };
    this.save();
    return this.get();
  }

  regenerateApiKey(): AppSettings {
    return this.update({
      localApi: {
        ...this.settings.localApi,
        apiKey: `briefink_${randomBytes(18).toString("hex")}`
      }
    });
  }

  reset(): AppSettings {
    this.settings = defaultSettings();
    this.save();
    return this.get();
  }

  save(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.settings, null, 2), "utf8");
  }

  private load(): AppSettings {
    try {
      return mergeSettings(JSON.parse(readFileSync(this.filePath, "utf8")));
    } catch {
      const settings = defaultSettings();
      this.settings = settings;
      this.save();
      return settings;
    }
  }
}

function mergeSettings(value: unknown): AppSettings {
  const patch = isObject(value) ? (value as Partial<AppSettings>) : {};
  const defaults = defaultSettings();

  return {
    ...defaults,
    ...patch,
    language: { ...defaults.language, ...patch.language },
    recording: { ...defaults.recording, ...patch.recording },
    output: { ...defaults.output, ...patch.output },
    history: { ...defaults.history, ...patch.history },
    localApi: { ...defaults.localApi, ...patch.localApi },
    appearance: {
      language: patch.appearance?.language === "zh-CN" ? "zh-CN" : "en"
    }
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
