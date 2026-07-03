export type LanguageCode = "auto" | "same" | "en" | "zh" | "ja" | "ko" | "es" | "fr" | "de" | string;

export type ModelStatus = "not_installed" | "downloading" | "installed" | "running" | "stopped" | "error";

export type ModelKind = "local" | "cloud" | "custom";

export interface CloudProviderConfig {
  endpoint?: string;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  modelName?: string;
  provider?: string;
  organization?: string;
  timeoutMs?: number;
}

export interface SpeechModel {
  id: string;
  name: string;
  kind: ModelKind;
  languageCapability: "english-only" | "multilingual";
  sizeLabel: string;
  speedScore: number;
  accuracyScore: number;
  status: ModelStatus;
  default: boolean;
  supportsTranslation: boolean;
  managedByBriefInk?: boolean;
  config?: CloudProviderConfig;
  engine?: "whisper.cpp" | "mlx" | "cloud" | "custom";
  downloadUrl?: string;
  localPath?: string;
  expectedBytes?: number;
  expectedSha256?: string;
  runtimeNote?: string;
  error?: string;
}

export interface AppSettings {
  hotkey: string;
  language: {
    recognitionLanguage: LanguageCode;
    outputLanguage: LanguageCode;
  };
  recording: {
    inputDeviceId: string;
    maxDurationSeconds: number;
    audioFormat: "webm" | "wav" | string;
  };
  output: {
    autoCopy: boolean;
    autoPaste: boolean;
    showNotification: boolean;
    copyTarget: "translation" | "transcription";
  };
  history: {
    saveHistory: boolean;
    saveAudio: boolean;
    audioDirectory: string | null;
    retentionDays: number;
  };
  localApi: {
    enabled: boolean;
    host: string;
    port: number;
    apiKey: string;
    openAiCompatible: boolean;
  };
  autoStartDefaultModel: boolean;
  appearance?: {
    language: "en" | "zh-CN";
  };
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

export type SettingsPatch = DeepPartial<AppSettings>;

export interface HistoryEntry {
  id: string;
  createdAt: string;
  updatedAt?: string;
  duration: number;
  modelId: string;
  modelName: string;
  recognitionLanguage: LanguageCode;
  outputLanguage: LanguageCode;
  text: string;
  translatedText?: string;
  audioPath?: string;
  targets?: OutputTarget[];
  status: "success" | "error";
  error?: string;
}

export type OutputTarget = "clipboard" | "notification" | "paste";

export interface OutputPayload {
  text: string;
  title?: string;
  body?: string;
  targets?: OutputTarget[];
}

export interface OutputResult {
  copiedToClipboard: boolean;
  pastedIntoFrontmostApp?: boolean;
  notificationShown: boolean;
}

export interface TranscriptionOptions {
  modelId?: string;
  language: LanguageCode;
  outputLanguage: LanguageCode;
}

export interface TranscriptionResult {
  text: string;
  translatedText?: string;
  language?: LanguageCode;
  targetLanguage?: LanguageCode;
  duration?: number;
  modelId?: string;
  model?: string;
  providerId?: string;
  task?: AudioTaskKind;
  segments?: TranscriptionSegment[];
}

export interface RecordingState {
  status: "idle" | "recording" | "transcribing" | "completed" | "error";
  durationSeconds?: number;
  updatedAt?: number;
  modelName?: string;
  startedAt?: string;
  lastResult?: TranscriptionResult;
  error?: string;
}

export type RecordingChangeReason = "renderer" | "hotkey" | "lifecycle";

export interface RecordingControlResult {
  ok: true;
  state: RecordingState;
}

export interface RecordingChangedEvent {
  state: RecordingState;
  reason: RecordingChangeReason;
}

export type ManagedProcessKind = "model" | "api";

export interface ProviderDefinition {
  id: string;
  kind: "mock" | "local" | "cloud" | "custom";
  displayName: string;
  enabled: boolean;
  defaultModelId: string;
  baseUrl?: string;
  apiKey?: string;
  timeoutMs?: number;
}

export interface ModelDefinition {
  id: string;
  providerId: string;
  displayName: string;
  ownedBy: string;
  supportsTranscription: boolean;
  supportsTranslation: boolean;
  createdAt: number;
}

export interface LocalApiServerConfig {
  enabled: boolean;
  host: string;
  port: number;
  bearerToken: string;
  defaultModelId: string;
}

export interface ModelManagerConfig {
  activeModelId: string;
  providers: ProviderDefinition[];
  models: ModelDefinition[];
  localApiServer: LocalApiServerConfig;
}

export type AudioTaskKind = "transcription" | "translation";

export type TranscriptionResponseFormat = "json" | "text" | "srt" | "verbose_json" | "vtt";

export interface TranscriptionRequest {
  task?: AudioTaskKind;
  model: string;
  audio: {
    data: Uint8Array;
    filename: string;
    mimeType?: string;
  };
  language?: string;
  prompt?: string;
  responseFormat?: TranscriptionResponseFormat;
  temperature?: number;
}

export interface TranscriptionSegment {
  id: number;
  start: number;
  end: number;
  text: string;
}

export interface OpenAIModelListResponse {
  object: "list";
  data: Array<{
    id: string;
    object: "model";
    created: number;
    owned_by: string;
  }>;
}

export const IPC_CHANNELS = {
  recordingGetState: "recording:get-state",
  recordingStart: "recording:start",
  recordingStop: "recording:stop",
  recordingToggle: "recording:toggle",
  recordingChanged: "recording:changed",
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

export type Unsubscribe = () => void;

export interface BriefInkElectronApi {
  recording: {
    getState: () => Promise<RecordingState>;
    start: () => Promise<RecordingControlResult>;
    stop: () => Promise<RecordingControlResult>;
    toggle: () => Promise<RecordingControlResult>;
    onChanged: (listener: (event: RecordingChangedEvent) => void) => Unsubscribe;
  };
}

export interface BriefInkSnapshot {
  appVersion: string;
  settings: AppSettings;
  models: SpeechModel[];
  history: HistoryEntry[];
  recording: RecordingState;
  localApiRunning: boolean;
}

export type AppSnapshot = BriefInkSnapshot;

export interface BriefInkApi {
  getSnapshot(): Promise<BriefInkSnapshot>;
  updateSettings(patch: SettingsPatch): Promise<AppSettings>;
  listModels(): Promise<SpeechModel[]>;
  downloadModel(modelId: string): Promise<SpeechModel[]>;
  startModel(modelId: string): Promise<SpeechModel[]>;
  stopModel(modelId: string): Promise<SpeechModel[]>;
  setDefaultModel(modelId: string): Promise<SpeechModel[]>;
  configureModel(modelId: string, config: CloudProviderConfig): Promise<SpeechModel[]>;
  getRecordingState(): Promise<RecordingState>;
  startRecording(): Promise<RecordingState>;
  stopRecording(): Promise<RecordingState>;
  toggleRecording(): Promise<RecordingState>;
  transcribeBlob(audio: ArrayBuffer, mimeType: string): Promise<RecordingState>;
  getMicrophoneAccess(): Promise<"granted" | "denied" | "restricted" | "not-determined" | "unknown">;
  requestMicrophoneAccess(): Promise<boolean>;
  getAccessibilityAccess(): Promise<boolean>;
  requestAccessibilityAccess(): Promise<boolean>;
  deleteHistory(id: string): Promise<HistoryEntry[]>;
  deleteHistoryMany(ids: string[]): Promise<HistoryEntry[]>;
  updateHistory(id: string, patch: Pick<Partial<HistoryEntry>, "text" | "translatedText">): Promise<HistoryEntry[]>;
  clearHistory(): Promise<HistoryEntry[]>;
  openRecordingsDirectory(): Promise<void>;
  startLocalApi(): Promise<AppSettings>;
  stopLocalApi(): Promise<AppSettings>;
  openLogsDirectory(): Promise<void>;
  onRecordingState(callback: (state: RecordingState) => void): () => void;
  onHotkeyToggle(callback: () => void): () => void;
}
