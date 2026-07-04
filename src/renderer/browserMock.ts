import type { AppSnapshot, BriefInkApi, CloudProviderConfig, RecordingState, SpeechModel, SettingsPatch } from "../shared/types";

const models: SpeechModel[] = [
  {
    id: "whisper-large-v3-turbo-quantized",
    name: "Whisper Large v3 Turbo Quantized",
    kind: "local",
    languageCapability: "multilingual",
    sizeLabel: "547 MB",
    speedScore: 8.1,
    accuracyScore: 9.5,
    status: "running",
    default: true,
    supportsTranslation: true,
    managedByBriefInk: true,
    engine: "whisper.cpp",
    runtimeNote: "Runs with BriefInk's bundled transcription runtime."
  },
  {
    id: "custom-openai-compatible",
    name: "Third-party Speech API",
    kind: "custom",
    languageCapability: "multilingual",
    sizeLabel: "Custom",
    speedScore: 8,
    accuracyScore: 8,
    status: "stopped",
    default: false,
    supportsTranslation: false
  }
];

let snapshot: AppSnapshot = {
  appVersion: "0.1.0",
  models,
  history: [],
  localApiRunning: false,
  recording: {
    status: "idle",
    durationSeconds: 0,
    modelName: models[0].name
  },
  settings: {
    hotkey: "Option+Space",
    language: { recognitionLanguage: "auto", outputLanguage: "same" },
    recording: { inputDeviceId: "default", maxDurationSeconds: 600, audioFormat: "webm" },
    output: { autoCopy: true, autoPaste: true, showNotification: true, copyTarget: "translation" },
    history: { saveHistory: false, saveAudio: false, audioDirectory: null, retentionDays: 30 },
    localApi: {
      enabled: false,
      host: "127.0.0.1",
      port: 8765,
      apiKey: "briefink_preview_key",
      openAiCompatible: true
    },
    appearance: { language: "en" },
    autoStartDefaultModel: false
  }
};

const listeners = new Set<(state: RecordingState) => void>();
const modelListeners = new Set<(models: SpeechModel[]) => void>();

function updateModels(next: SpeechModel[]) {
  snapshot = { ...snapshot, models: next };
  modelListeners.forEach((listener) => listener(structuredClone(next)));
  return next;
}

function emitRecording(recording: RecordingState) {
  snapshot = { ...snapshot, recording };
  listeners.forEach((listener) => listener(recording));
  return recording;
}

export function installBrowserMockApi() {
  if (window.briefInk) return;

  const api: BriefInkApi = {
    async getSnapshot() {
      return structuredClone(snapshot);
    },
    async updateSettings(patch: SettingsPatch) {
      snapshot = {
        ...snapshot,
        settings: {
          ...snapshot.settings,
          ...patch,
          language: { ...snapshot.settings.language, ...patch.language },
          recording: { ...snapshot.settings.recording, ...patch.recording },
          output: { ...snapshot.settings.output, ...patch.output },
          history: { ...snapshot.settings.history, ...patch.history },
          localApi: { ...snapshot.settings.localApi, ...patch.localApi }
        }
      };
      return structuredClone(snapshot.settings);
    },
    async listModels() {
      return structuredClone(snapshot.models);
    },
    async downloadModel(modelId: string) {
      updateModels(snapshot.models.map((model) =>
        model.id === modelId
          ? { ...model, status: "downloading", downloadProgress: { receivedBytes: 0, totalBytes: 574041195, percent: 0 } }
          : model
      ));
      for (const percent of [18, 42, 68, 91, 100]) {
        await new Promise((resolve) => setTimeout(resolve, 120));
        updateModels(snapshot.models.map((model) =>
          model.id === modelId
            ? {
                ...model,
                status: "downloading",
                downloadProgress: {
                  receivedBytes: Math.round(574041195 * (percent / 100)),
                  totalBytes: 574041195,
                  percent
                }
              }
            : model
        ));
      }
      return updateModels(snapshot.models.map((model) =>
        model.id === modelId ? { ...model, status: "installed", downloadProgress: undefined } : model
      ));
    },
    async startModel(modelId: string) {
      return updateModels(snapshot.models.map((model) => (model.id === modelId ? { ...model, status: "running" } : model)));
    },
    async stopModel(modelId: string) {
      return updateModels(snapshot.models.map((model) => (model.id === modelId ? { ...model, status: "stopped" } : model)));
    },
    async setDefaultModel(modelId: string) {
      return updateModels(snapshot.models.map((model) => ({ ...model, default: model.id === modelId })));
    },
    async configureModel(modelId: string, config: CloudProviderConfig) {
      return updateModels(snapshot.models.map((model) => (model.id === modelId ? { ...model, config, status: "installed" } : model)));
    },
    async getRecordingState() {
      return structuredClone(snapshot.recording);
    },
    async startRecording() {
      return emitRecording({ status: "recording", durationSeconds: 0, modelName: snapshot.models.find((model) => model.default)?.name });
    },
    async stopRecording() {
      return emitRecording({ status: "idle", durationSeconds: 0, modelName: snapshot.models.find((model) => model.default)?.name });
    },
    async toggleRecording() {
      if (snapshot.recording.status === "recording") {
        return emitRecording({
          status: "completed",
          durationSeconds: 3.2,
          modelName: snapshot.models.find((model) => model.default)?.name,
          lastResult: {
            text: "BriefInk preview transcript.",
            language: snapshot.settings.language.recognitionLanguage,
            targetLanguage: snapshot.settings.language.outputLanguage,
            duration: 3.2,
            modelId: snapshot.models.find((model) => model.default)?.id
          }
        });
      }
      return emitRecording({ status: "recording", durationSeconds: 0, modelName: snapshot.models.find((model) => model.default)?.name });
    },
    async transcribeBlob() {
      return emitRecording({
        status: "completed",
        durationSeconds: 3.2,
        modelName: snapshot.models.find((model) => model.default)?.name,
        lastResult: {
          text: "BriefInk preview transcript from browser microphone.",
          language: snapshot.settings.language.recognitionLanguage,
          targetLanguage: snapshot.settings.language.outputLanguage,
          duration: 3.2,
          modelId: snapshot.models.find((model) => model.default)?.id
        }
      });
    },
    async reportRecordingError(message: string) {
      return emitRecording({ status: "error", error: message, durationSeconds: 0, modelName: snapshot.models.find((model) => model.default)?.name });
    },
    async getMicrophoneAccess() {
      return "granted";
    },
    async requestMicrophoneAccess() {
      return true;
    },
    async getAccessibilityAccess() {
      return true;
    },
    async requestAccessibilityAccess() {
      return true;
    },
    async deleteHistory(id: string) {
      snapshot = { ...snapshot, history: snapshot.history.filter((entry) => entry.id !== id) };
      return structuredClone(snapshot.history);
    },
    async deleteHistoryMany(ids: string[]) {
      const selected = new Set(ids);
      snapshot = { ...snapshot, history: snapshot.history.filter((entry) => !selected.has(entry.id)) };
      return structuredClone(snapshot.history);
    },
    async updateHistory(id, patch) {
      snapshot = {
        ...snapshot,
        history: snapshot.history.map((entry) => (entry.id === id ? { ...entry, ...patch, updatedAt: new Date().toISOString() } : entry))
      };
      return structuredClone(snapshot.history);
    },
    async clearHistory() {
      snapshot = { ...snapshot, history: [] };
      return [];
    },
    async openRecordingsDirectory() {
      console.info("BriefInk preview: recordings folder is only available in the Electron app.");
    },
    async startLocalApi() {
      snapshot = { ...snapshot, localApiRunning: true, settings: { ...snapshot.settings, localApi: { ...snapshot.settings.localApi, enabled: true } } };
      return structuredClone(snapshot.settings);
    },
    async stopLocalApi() {
      snapshot = { ...snapshot, localApiRunning: false, settings: { ...snapshot.settings, localApi: { ...snapshot.settings.localApi, enabled: false } } };
      return structuredClone(snapshot.settings);
    },
    async openLogsDirectory() {
      console.info("BriefInk preview: logs folder is only available in the Electron app.");
    },
    async checkForUpdates() {
      return {
        currentVersion: snapshot.appVersion,
        latestVersion: snapshot.appVersion,
        updateAvailable: false,
        releaseUrl: "https://github.com/XksA-me/BriefInk",
        releaseName: `BriefInk v${snapshot.appVersion}`
      };
    },
    async openExternalUrl(url: string) {
      console.info("BriefInk preview: opening external URL", url);
    },
    onModelsChanged(callback) {
      modelListeners.add(callback);
      return () => modelListeners.delete(callback);
    },
    onRecordingState(callback) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    onHotkeyToggle() {
      return () => undefined;
    }
  };

  window.briefInk = api;
}
