import type { IpcRendererEvent } from "electron";
import type {
  BriefInkApi,
  CloudProviderConfig,
  RecordingState,
  SettingsPatch,
  SpeechModel
} from "../src/shared/types.js";

const { contextBridge, ipcRenderer } = require("electron") as typeof import("electron");

const api: BriefInkApi = {
  getSnapshot: () => ipcRenderer.invoke("snapshot"),
  updateSettings: (patch: SettingsPatch) => ipcRenderer.invoke("settings:update", patch),
  listModels: () => ipcRenderer.invoke("models:list"),
  downloadModel: (modelId: string) => ipcRenderer.invoke("models:download", modelId),
  startModel: (modelId: string) => ipcRenderer.invoke("models:start", modelId),
  stopModel: (modelId: string) => ipcRenderer.invoke("models:stop", modelId),
  setDefaultModel: (modelId: string) => ipcRenderer.invoke("models:default", modelId),
  configureModel: (modelId: string, config: CloudProviderConfig) => ipcRenderer.invoke("models:configure", modelId, config),
  getRecordingState: () => ipcRenderer.invoke("recording:get-state"),
  startRecording: () => ipcRenderer.invoke("recording:start"),
  stopRecording: () => ipcRenderer.invoke("recording:stop"),
  toggleRecording: () => ipcRenderer.invoke("recording:toggle"),
  transcribeBlob: (audio: ArrayBuffer, mimeType: string) => ipcRenderer.invoke("recording:transcribeBlob", audio, mimeType),
  reportRecordingError: (message: string) => ipcRenderer.invoke("recording:reportError", message),
  getMicrophoneAccess: () => ipcRenderer.invoke("permissions:getMicrophoneAccess"),
  requestMicrophoneAccess: () => ipcRenderer.invoke("permissions:requestMicrophoneAccess"),
  getAccessibilityAccess: () => ipcRenderer.invoke("permissions:getAccessibilityAccess"),
  requestAccessibilityAccess: () => ipcRenderer.invoke("permissions:requestAccessibilityAccess"),
  deleteHistory: (id: string) => ipcRenderer.invoke("history:delete", id),
  deleteHistoryMany: (ids: string[]) => ipcRenderer.invoke("history:deleteMany", ids),
  updateHistory: (id, patch) => ipcRenderer.invoke("history:update", id, patch),
  clearHistory: () => ipcRenderer.invoke("history:clear"),
  openRecordingsDirectory: () => ipcRenderer.invoke("recordings:openDirectory"),
  startLocalApi: () => ipcRenderer.invoke("api:start"),
  stopLocalApi: () => ipcRenderer.invoke("api:stop"),
  openLogsDirectory: () => ipcRenderer.invoke("logs:openDirectory"),
  onModelsChanged(callback: (models: SpeechModel[]) => void) {
    const listener = (_event: IpcRendererEvent, models: SpeechModel[]) => callback(models);
    ipcRenderer.on("models:changed", listener);
    return () => ipcRenderer.off("models:changed", listener);
  },
  onRecordingState(callback: (state: RecordingState) => void) {
    const listener = (_event: IpcRendererEvent, payload: { state?: RecordingState } | RecordingState) => {
      callback("state" in payload && payload.state ? payload.state : payload as RecordingState);
    };
    ipcRenderer.on("recording-state", listener);
    ipcRenderer.on("recording:changed", listener);
    return () => {
      ipcRenderer.off("recording-state", listener);
      ipcRenderer.off("recording:changed", listener);
    };
  },
  onHotkeyToggle(callback: () => void) {
    const listener = () => callback();
    ipcRenderer.on("hotkey:toggle-recording", listener);
    return () => ipcRenderer.off("hotkey:toggle-recording", listener);
  }
};

contextBridge.exposeInMainWorld("briefInk", api);
