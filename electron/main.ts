import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  globalShortcut,
  ipcMain,
  Notification,
  screen,
  session,
  shell,
  systemPreferences
} from "electron";
import { HistoryStore } from "../src/main/historyStore.js";
import { LocalApiServer } from "../src/main/localApiServer.js";
import { initLogger, logger } from "../src/main/logger.js";
import { ModelManager } from "../src/main/modelManager.js";
import { createTranscriptionProvider, type TranscriptionProvider } from "../src/main/providers.js";
import { SettingsStore } from "../src/main/settingsStore.js";
import { IPC_CHANNELS } from "../src/shared/types.js";
import type {
  AppSettings,
  CloudProviderConfig,
  HistoryEntry,
  ManagedProcessKind,
  OutputPayload,
  OutputResult,
  OutputTarget,
  RecordingState,
  SettingsPatch
} from "../src/shared/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;

let mainWindow: BrowserWindow | null = null;
let hudWindow: BrowserWindow | null = null;
let hudHideTimer: NodeJS.Timeout | null = null;
let settingsStore: SettingsStore;
let historyStore: HistoryStore;
let modelManager: ModelManager;
let provider: TranscriptionProvider;
let localApiServer: LocalApiServer;
let isQuitting = false;
const gotSingleInstanceLock = app.requestSingleInstanceLock();

let recordingState: RecordingState = {
  status: "idle",
  durationSeconds: 0,
  updatedAt: Date.now(),
  modelName: "Whisper Large v3 Turbo Quantized"
};

type ManagedProcessEntry = {
  kind: ManagedProcessKind;
  process: ChildProcess;
};

const managedProcesses = new Set<ManagedProcessEntry>();

const mainMessages = {
  en: {
    hotkeyFailed: "Could not register {accelerator}. Choose another shortcut.",
    noAudioPayload: "Recording stopped without audio data. Use the in-app recorder or global hotkey path.",
    pasted: "Transcription pasted into the frontmost app.",
    copied: "Transcription copied to clipboard.",
    recordingFailed: "Recording failed",
    accessibilityTitle: "BriefInk needs Accessibility",
    accessibilityBody: "Enable Accessibility permission to auto paste into other apps."
  },
  "zh-CN": {
    hotkeyFailed: "无法注册快捷键 {accelerator}，请更换一个组合键。",
    noAudioPayload: "录音停止但没有收到音频数据。请从录音页或全局快捷键重新开始。",
    pasted: "转写内容已粘贴到当前 App。",
    copied: "转写内容已复制到剪贴板。",
    recordingFailed: "录音失败",
    accessibilityTitle: "BriefInk 需要辅助功能权限",
    accessibilityBody: "请授权辅助功能权限，BriefInk 才能自动粘贴到其他 App。"
  }
} as const;

type MainMessageKey = keyof typeof mainMessages.en;

function mainText(key: MainMessageKey, replacements?: Record<string, string | number>): string {
  const language = settingsStore?.get().appearance?.language ?? "en";
  const dictionary = mainMessages[language] ?? mainMessages.en;
  const template = dictionary[key] ?? mainMessages.en[key];
  if (!replacements) return template;
  let text: string = template;
  for (const [name, value] of Object.entries(replacements)) {
    text = text.replaceAll(`{${name}}`, String(value));
  }
  return text;
}

function userDataPath(...parts: string[]) {
  return path.join(app.getPath("userData"), ...parts);
}

async function createWindow(): Promise<void> {
  if (mainWindow && !mainWindow.isDestroyed()) {
    focusMainWindow();
    return;
  }

  logger.info("Creating main window", { isDev });
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 980,
    minHeight: 640,
    title: "BriefInk",
    backgroundColor: "#f8fafc",
    show: false,
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    logger.info("Main window hidden instead of closed");
    mainWindow?.hide();
  });
  mainWindow.on("closed", () => {
    logger.info("Main window closed");
    mainWindow = null;
  });
  mainWindow.once("ready-to-show", () => {
    logger.info("Main window ready to show");
    focusMainWindow();
  });
  mainWindow.webContents.on("did-finish-load", () => {
    logger.info("Renderer finished loading");
    focusMainWindow();
  });
  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    logger.error("Renderer failed to load", { errorCode, errorDescription, validatedURL });
  });
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    logger.error("Renderer process gone", details);
  });
  mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    logger.debug("Renderer console", { level, message, line, sourceId });
  });

  if (isDev) {
    logger.info("Loading dev renderer", { url: process.env.VITE_DEV_SERVER_URL ?? "http://127.0.0.1:5173" });
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL ?? "http://127.0.0.1:5173");
  } else {
    const indexPath = path.join(app.getAppPath(), "dist", "index.html");
    logger.info("Loading packaged renderer", { indexPath });
    await mainWindow.loadFile(indexPath);
  }
}

async function createHudWindow(): Promise<void> {
  if (hudWindow && !hudWindow.isDestroyed()) return;

  hudWindow = new BrowserWindow({
    width: 520,
    height: 104,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    closable: false,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  hudWindow.setIgnoreMouseEvents(true, { forward: true });
  hudWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  hudWindow.setAlwaysOnTop(true, "screen-saver");
  hudWindow.on("closed", () => {
    hudWindow = null;
  });
  await hudWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(hudHtml())}`);
}

function positionHudWindow(): void {
  if (!hudWindow || hudWindow.isDestroyed()) return;
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const { x, y, width, height } = display.workArea;
  const [hudWidth, hudHeight] = hudWindow.getSize();
  hudWindow.setBounds({
    x: Math.round(x + (width - hudWidth) / 2),
    y: Math.round(y + height - hudHeight - 92),
    width: hudWidth,
    height: hudHeight
  });
}

function updateHud(state: RecordingState): void {
  if (!hudWindow || hudWindow.isDestroyed()) return;
  if (hudHideTimer) {
    clearTimeout(hudHideTimer);
    hudHideTimer = null;
  }

  hudWindow.webContents.send(IPC_CHANNELS.recordingChanged, { state, reason: "hotkey" });
  if (state.status === "idle") {
    hudWindow.hide();
    return;
  }

  positionHudWindow();
  hudWindow.showInactive();
  if (state.status === "completed" || state.status === "error") {
    hudHideTimer = setTimeout(() => {
      hudWindow?.hide();
      hudHideTimer = null;
    }, 1800);
  }
}

function hudHtml(): string {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    * { box-sizing: border-box; }
    html, body {
      width: 100%;
      height: 100%;
      margin: 0;
      overflow: hidden;
      background: transparent;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      user-select: none;
    }
    body {
      display: grid;
      place-items: center;
    }
    .hud {
      display: grid;
      grid-template-columns: 42px minmax(0, 1fr) auto;
      align-items: center;
      gap: 14px;
      width: 500px;
      min-height: 76px;
      padding: 14px 18px;
      color: white;
      background: rgba(15, 23, 42, 0.88);
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 22px;
      box-shadow: 0 22px 70px rgba(15, 23, 42, 0.35);
      backdrop-filter: blur(18px) saturate(140%);
      -webkit-backdrop-filter: blur(18px) saturate(140%);
    }
    .icon {
      display: grid;
      width: 42px;
      height: 42px;
      place-items: center;
      border-radius: 999px;
      background: rgba(20, 184, 166, 0.20);
      color: #5eead4;
    }
    .recording .icon {
      background: rgba(249, 115, 22, 0.18);
      color: #fdba74;
      animation: pulse 1.1s ease-in-out infinite;
    }
    .transcribing .icon {
      animation: spin 1.1s linear infinite;
    }
    .error .icon {
      background: rgba(239, 68, 68, 0.20);
      color: #fca5a5;
    }
    strong {
      display: block;
      overflow: hidden;
      color: #f8fafc;
      font-size: 15px;
      line-height: 1.25;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    span {
      display: block;
      margin-top: 4px;
      overflow: hidden;
      color: #cbd5e1;
      font-size: 12px;
      line-height: 1.35;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .right {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .timer {
      min-width: 48px;
      padding: 5px 8px;
      color: #ccfbf1;
      background: rgba(20, 184, 166, 0.14);
      border: 1px solid rgba(94, 234, 212, 0.25);
      border-radius: 999px;
      font-size: 12px;
      font-variant-numeric: tabular-nums;
      font-weight: 800;
      text-align: center;
    }
    .wave {
      display: flex;
      align-items: center;
      gap: 3px;
      width: 58px;
      height: 28px;
    }
    .wave i {
      display: block;
      width: 4px;
      height: 8px;
      background: #5eead4;
      border-radius: 999px;
      opacity: 0.55;
    }
    .recording .wave i {
      background: #fdba74;
      opacity: 1;
      animation: wave 850ms ease-in-out infinite;
    }
    .wave i:nth-child(2) { animation-delay: 90ms; }
    .wave i:nth-child(3) { animation-delay: 180ms; }
    .wave i:nth-child(4) { animation-delay: 270ms; }
    .wave i:nth-child(5) { animation-delay: 360ms; }
    .wave i:nth-child(6) { animation-delay: 450ms; }
    .wave i:nth-child(7) { animation-delay: 540ms; }
    @keyframes wave {
      0%, 100% { height: 7px; }
      50% { height: 24px; }
    }
    @keyframes pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(249, 115, 22, 0.22); }
      50% { box-shadow: 0 0 0 8px rgba(249, 115, 22, 0.02); }
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <div id="hud" class="hud idle">
    <div class="icon" id="icon">●</div>
    <div>
      <strong id="title">Ready</strong>
      <span id="subtitle">BriefInk</span>
    </div>
    <div class="right">
      <div id="timer" class="timer">00:00</div>
      <div class="wave"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
    </div>
  </div>
  <script>
    const messages = {
      en: {
        ready: "Ready",
        recording: "Recording",
        transcribing: "Transcribing",
        completed: "Pasted",
        attention: "BriefInk needs attention",
        stopHint: "Press the shortcut again to stop",
        pastedHint: "Text is ready in the current app",
        error: "Something went wrong"
      },
      "zh-CN": {
        ready: "就绪",
        recording: "正在录音",
        transcribing: "正在转写",
        completed: "已粘贴",
        attention: "BriefInk 需要处理",
        stopHint: "再次按快捷键停止录音",
        pastedHint: "文字已准备好并粘贴到当前 App",
        error: "出现问题"
      }
    };
    let current = { status: "idle", durationSeconds: 0 };
    let language = "en";
    let tick = null;
    const hud = document.getElementById("hud");
    const icon = document.getElementById("icon");
    const title = document.getElementById("title");
    const subtitle = document.getElementById("subtitle");
    const timer = document.getElementById("timer");

    function elapsedSeconds(state) {
      if (state.status !== "recording" || !state.startedAt) return state.durationSeconds || 0;
      return Math.max(0, Math.floor((Date.now() - new Date(state.startedAt).getTime()) / 1000));
    }
    function format(seconds) {
      const minutes = String(Math.floor(seconds / 60)).padStart(2, "0");
      const rest = String(Math.floor(seconds % 60)).padStart(2, "0");
      return minutes + ":" + rest;
    }
    function text(key) {
      return (messages[language] || messages.en)[key] || messages.en[key] || key;
    }
    async function applyLanguage() {
      try {
        const snapshot = await window.briefInk?.getSnapshot?.();
        language = snapshot?.settings?.appearance?.language || "en";
      } catch (_error) {
        language = "en";
      }
    }
    function titleFor(state) {
      if (state.status === "recording") return text("recording");
      if (state.status === "transcribing") return text("transcribing");
      if (state.status === "completed") return text("completed");
      if (state.status === "error") return text("attention");
      return text("ready");
    }
    function iconFor(state) {
      if (state.status === "recording") return "●";
      if (state.status === "transcribing") return "↻";
      if (state.status === "completed") return "✓";
      if (state.status === "error") return "!";
      return "●";
    }
    function subtitleFor(state) {
      if (state.status === "recording") return text("stopHint");
      if (state.status === "transcribing") return state.modelName || "BriefInk";
      if (state.status === "completed") return text("pastedHint");
      if (state.status === "error") return state.error || text("error");
      return state.modelName || "BriefInk";
    }
    async function render(state) {
      await applyLanguage();
      current = state || current;
      hud.className = "hud " + current.status;
      title.textContent = titleFor(current);
      subtitle.textContent = subtitleFor(current);
      icon.textContent = iconFor(current);
      timer.textContent = format(elapsedSeconds(current));
      if (tick) clearInterval(tick);
      if (current.status === "recording") {
        tick = setInterval(() => {
          timer.textContent = format(elapsedSeconds(current));
        }, 250);
      }
    }
    window.briefInk?.getSnapshot?.().then((snapshot) => render(snapshot.recording)).catch(() => {});
    window.briefInk?.onRecordingState?.((state) => void render(state));
  </script>
</body>
</html>`;
}

function configurePermissions(): void {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (permission === "media") {
      logger.info("Granting renderer media permission request");
      callback(true);
      return;
    }
    callback(false);
  });

  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    if (permission === "media") return true;
    return false;
  });
}

function focusMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  app.focus({ steal: true });
}

function broadcastRecordingState() {
  mainWindow?.webContents.send(IPC_CHANNELS.recordingChanged, {
    state: recordingState,
    reason: "renderer"
  });
  updateHud(recordingState);
}

function setRecordingState(patch: Partial<RecordingState>): RecordingState {
  recordingState = { ...recordingState, ...patch, updatedAt: Date.now() };
  broadcastRecordingState();
  return { ...recordingState };
}

function registerHotkey(accelerator: string) {
  globalShortcut.unregisterAll();
  const electronAccelerator = toElectronAccelerator(accelerator);
  const registered = globalShortcut.register(electronAccelerator, () => {
    logger.info("Global recording hotkey pressed", { accelerator: electronAccelerator });
    if (!mainWindow || mainWindow.isDestroyed()) {
      void createWindow().then(() => mainWindow?.webContents.send("hotkey:toggle-recording"));
      return;
    }
    mainWindow.webContents.send("hotkey:toggle-recording");
  });
  if (!registered) {
    logger.warn("Could not register global hotkey", { accelerator, electronAccelerator });
    setRecordingState({ status: "error", error: mainText("hotkeyFailed", { accelerator }) });
  } else {
    logger.info("Registered global hotkey", { accelerator, electronAccelerator });
  }
}

function toElectronAccelerator(hotkey: string): string {
  const parts = hotkey.trim().split("+").filter(Boolean);
  if (!parts.length) return "Alt+Space";
  return parts.map((part) => {
    if (/^option$/i.test(part)) return "Alt";
    if (/^command$/i.test(part)) return "Command";
    if (/^control$/i.test(part)) return "Control";
    if (/^shift$/i.test(part)) return "Shift";
    return part;
  }).join("+");
}

async function toggleRecording(): Promise<RecordingState> {
  if (recordingState.status === "recording") {
    logger.info("Stopping recording state from legacy toggle without audio payload");
    return setRecordingState({
      status: "error",
      error: mainText("noAudioPayload")
    });
  }

  const model = modelManager.getDefault();
  logger.info("Starting recording from toggle", { modelId: model.id, modelName: model.name });
  return setRecordingState({
    status: "recording",
    startedAt: new Date().toISOString(),
    durationSeconds: 0,
    modelName: model.name,
    error: undefined
  });
}

async function transcribeAudioFile(audioPath: string): Promise<RecordingState> {
  const settings = settingsStore.get();
  const model = modelManager.getDefault();
  logger.info("Starting transcription", {
    audioPath,
    modelId: model.id,
    recognitionLanguage: settings.language.recognitionLanguage,
    outputLanguage: settings.language.outputLanguage
  });
  try {
    const result = await provider.transcribe(audioPath, {
      language: settings.language.recognitionLanguage,
      outputLanguage: settings.language.outputLanguage
    });
    const finalText = settings.output.copyTarget === "translation" ? result.translatedText ?? result.text : result.text;
    const output = await sendOutput({ text: finalText, body: settings.output.autoPaste ? mainText("pasted") : mainText("copied") });
    if (settings.history.saveHistory) {
      historyStore.add(toHistoryEntry(result, model.name, audioPath, settings));
    }
    logger.info("Transcription completed", {
      modelId: result.modelId,
      duration: result.duration,
      copied: output.copiedToClipboard,
      pasted: output.pastedIntoFrontmostApp,
      savedHistory: settings.history.saveHistory
    });
    return setRecordingState({ status: "completed", durationSeconds: result.duration ?? 0, lastResult: result, error: undefined });
  } catch (error) {
    logger.error("Transcription failed", error);
    return setRecordingState({
      status: "error",
      error: error instanceof Error ? error.message : "Transcription failed"
    });
  }
}

function toHistoryEntry(
  result: NonNullable<RecordingState["lastResult"]>,
  modelName: string,
  audioPath: string,
  settings: AppSettings
): HistoryEntry {
  return {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    duration: result.duration ?? 0,
    modelId: result.modelId ?? result.model ?? "default",
    modelName,
    recognitionLanguage: settings.language.recognitionLanguage,
    outputLanguage: settings.language.outputLanguage,
    text: result.text,
    translatedText: result.translatedText,
    audioPath: settings.history.saveAudio ? audioPath : undefined,
    status: "success"
  };
}

function registerIpc() {
  ipcMain.handle("app:getSnapshot", () => ({
    appVersion: app.getVersion(),
    settings: settingsStore.get(),
    models: modelManager.list(),
    history: historyStore.list(),
    recording: recordingState,
    localApiRunning: localApiServer.running
  }));
  ipcMain.handle("snapshot", () => ({
    appVersion: app.getVersion(),
    settings: settingsStore.get(),
    models: modelManager.list(),
    history: historyStore.list(),
    recording: recordingState,
    localApiRunning: localApiServer.running
  }));

  ipcMain.handle("settings:get", () => settingsStore.get());
  ipcMain.handle("settings:update", (_event, patch: SettingsPatch) => {
    logger.info("Updating settings", patch);
    const updated = settingsStore.update(patch);
    registerHotkey(updated.hotkey);
    return updated;
  });
  ipcMain.handle("settings:reset", () => settingsStore.reset());
  ipcMain.handle("settings:regenerateApiKey", () => settingsStore.regenerateApiKey());

  ipcMain.handle("models:list", () => modelManager.list());
  ipcMain.handle("models:download", (_event, id: string) => {
    logger.info("Downloading model", { id });
    return modelManager.download(id);
  });
  ipcMain.handle("models:start", (_event, id: string) => {
    logger.info("Starting model", { id });
    return modelManager.start(id);
  });
  ipcMain.handle("models:stop", (_event, id: string) => {
    logger.info("Stopping model", { id });
    return modelManager.stop(id);
  });
  ipcMain.handle("models:setDefault", (_event, id: string) => modelManager.setDefault(id));
  ipcMain.handle("models:default", (_event, id: string) => modelManager.setDefault(id));
  ipcMain.handle("models:configure", (_event, id: string, config: CloudProviderConfig) => modelManager.configure(id, config));

  ipcMain.handle(IPC_CHANNELS.recordingGetState, () => recordingState);
  ipcMain.handle(IPC_CHANNELS.recordingStart, () => setRecordingState({
    status: "recording",
    startedAt: new Date().toISOString(),
    durationSeconds: 0,
    modelName: modelManager.getDefault().name,
    error: undefined
  }));
  ipcMain.handle(IPC_CHANNELS.recordingStop, () =>
    setRecordingState({
      status: "error",
      error: mainText("noAudioPayload")
    })
  );
  ipcMain.handle(IPC_CHANNELS.recordingToggle, () => toggleRecording());
  ipcMain.handle("recording:reportError", (_event, message: string) =>
    setRecordingState({
      status: "error",
      error: message || mainText("recordingFailed")
    })
  );
  ipcMain.handle("permissions:getMicrophoneAccess", () => {
    if (process.platform !== "darwin") return "unknown";
    return systemPreferences.getMediaAccessStatus("microphone");
  });
  ipcMain.handle("permissions:requestMicrophoneAccess", async () => {
    if (process.platform !== "darwin") return true;
    const status = systemPreferences.getMediaAccessStatus("microphone");
    logger.info("Microphone permission status", { status });
    if (status === "granted") return true;
    if (status === "denied" || status === "restricted") return false;
    const granted = await systemPreferences.askForMediaAccess("microphone");
    logger.info("Microphone permission request completed", { granted });
    return granted;
  });
  ipcMain.handle("permissions:getAccessibilityAccess", () => {
    if (process.platform !== "darwin") return true;
    return systemPreferences.isTrustedAccessibilityClient(false);
  });
  ipcMain.handle("permissions:requestAccessibilityAccess", () => {
    if (process.platform !== "darwin") return true;
    return systemPreferences.isTrustedAccessibilityClient(true);
  });
  ipcMain.handle("recording:transcribeBlob", async (_event, audioBuffer: ArrayBuffer, mimeType: string) => {
    logger.info("Received renderer audio blob", { bytes: audioBuffer.byteLength, mimeType });
    setRecordingState({ status: "transcribing", error: undefined });
    const extension = mimeType.includes("wav") ? "wav" : "webm";
    const recordingDirectory = userDataPath("recordings");
    mkdirSync(recordingDirectory, { recursive: true });
    const audioPath = path.join(recordingDirectory, `${timestampFileName()}.${extension}`);
    writeFileSync(audioPath, Buffer.from(audioBuffer));
    return transcribeAudioFile(audioPath);
  });

  ipcMain.handle("history:list", () => historyStore.list());
  ipcMain.handle("history:delete", (_event, id: string) => {
    deleteAudioForHistoryEntries(historyStore.list().filter((entry) => entry.id === id));
    return historyStore.delete(id);
  });
  ipcMain.handle("history:deleteMany", (_event, ids: string[]) => {
    const selected = new Set(ids);
    deleteAudioForHistoryEntries(historyStore.list().filter((entry) => selected.has(entry.id)));
    return historyStore.deleteMany(ids);
  });
  ipcMain.handle("history:update", (_event, id: string, patch: Pick<Partial<HistoryEntry>, "text" | "translatedText">) => historyStore.update(id, patch));
  ipcMain.handle("history:clear", () => {
    deleteAudioForHistoryEntries(historyStore.list());
    return historyStore.clear();
  });
  ipcMain.handle("recordings:openDirectory", async () => {
    const recordingDirectory = userDataPath("recordings");
    mkdirSync(recordingDirectory, { recursive: true });
    await shell.openPath(recordingDirectory);
  });

  ipcMain.handle("files:openDataDirectory", async () => {
    await shell.openPath(app.getPath("userData"));
  });
  ipcMain.handle("files:getStorePaths", () => ({
    settings: getSettingsPath(),
    history: getHistoryPath(),
    logs: getLogPath(),
    dataDirectory: app.getPath("userData")
  }));
  ipcMain.handle("logs:openDirectory", async () => {
    await shell.openPath(path.dirname(getLogPath()));
  });
  ipcMain.handle("files:selectDirectory", async () => {
    const options: Electron.OpenDialogOptions = {
      properties: ["openDirectory", "createDirectory"]
    };
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options);
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle("output:send", (_event, payload: OutputPayload) => sendOutput(payload));

  ipcMain.handle("localApi:start", async () => {
    settingsStore.update({ localApi: { enabled: true } });
    await localApiServer.start();
    return settingsStore.get();
  });
  ipcMain.handle("localApi:stop", async () => {
    await localApiServer.stop();
    return settingsStore.update({ localApi: { enabled: false } });
  });
  ipcMain.handle("api:start", async () => {
    logger.info("Starting local API server", settingsStore.get().localApi);
    settingsStore.update({ localApi: { enabled: true } });
    await localApiServer.start();
    return settingsStore.get();
  });
  ipcMain.handle("api:stop", async () => {
    logger.info("Stopping local API server");
    await localApiServer.stop();
    return settingsStore.update({ localApi: { enabled: false } });
  });
}

function getSettingsPath(): string {
  return userDataPath("settings.json");
}

function getHistoryPath(): string {
  return userDataPath("history.json");
}

function getModelStatePath(): string {
  return userDataPath("model-state.json");
}

function getLogPath(): string {
  return userDataPath("logs", "briefink.log");
}

function timestampFileName(date = new Date()): string {
  const pad = (value: number, size = 2) => value.toString().padStart(size, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("") + "_" + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
    pad(date.getMilliseconds(), 3)
  ].join("_");
}

function deleteAudioForHistoryEntries(entries: HistoryEntry[]): void {
  for (const entry of entries) {
    if (!entry.audioPath) continue;
    try {
      unlinkSync(entry.audioPath);
      logger.info("Deleted history audio file", { audioPath: entry.audioPath, historyId: entry.id });
    } catch (error) {
      logger.warn("Could not delete history audio file", { audioPath: entry.audioPath, historyId: entry.id, error });
    }
  }
}

async function sendOutput(payload: OutputPayload): Promise<OutputResult> {
  const settings = settingsStore.get();
  const targets = resolveOutputTargets(payload.targets, settings.output);
  const result: OutputResult = { copiedToClipboard: false, notificationShown: false, pastedIntoFrontmostApp: false };

  if (targets.includes("clipboard") || targets.includes("paste")) {
    clipboard.writeText(payload.text);
    result.copiedToClipboard = true;
  }

  if (targets.includes("paste")) {
    result.pastedIntoFrontmostApp = await pasteClipboardIntoFrontmostApp();
  }

  if (targets.includes("notification") && Notification.isSupported()) {
    new Notification({
      title: payload.title ?? "BriefInk",
      body: payload.body ?? payload.text
    }).show();
    result.notificationShown = true;
  }

  return result;
}

function resolveOutputTargets(requestedTargets: OutputTarget[] | undefined, preferences: AppSettings["output"]): OutputTarget[] {
  if (requestedTargets?.length) return requestedTargets;
  const targets: OutputTarget[] = [];
  if (preferences.autoCopy) targets.push("clipboard");
  if (preferences.autoPaste) targets.push("paste");
  if (preferences.showNotification) targets.push("notification");
  return targets;
}

async function pasteClipboardIntoFrontmostApp(): Promise<boolean> {
  if (process.platform !== "darwin") return false;
  if (!systemPreferences.isTrustedAccessibilityClient(false)) {
    logger.warn("Auto paste skipped because Accessibility permission is not granted");
    if (Notification.isSupported()) {
      new Notification({
        title: mainText("accessibilityTitle"),
        body: mainText("accessibilityBody")
      }).show();
    }
    return false;
  }

  await new Promise((resolve) => setTimeout(resolve, 120));
  return new Promise<boolean>((resolve) => {
    execFile(
      "/usr/bin/osascript",
      ["-e", 'tell application "System Events" to keystroke "v" using command down'],
      { timeout: 3000 },
      (error) => {
        if (error) {
          logger.error("Auto paste failed", error);
          resolve(false);
          return;
        }
        resolve(true);
      }
    );
  });
}

export function registerManagedProcess(kind: ManagedProcessKind, process: ChildProcess): () => void {
  logger.info("Registering managed process", { kind, pid: process.pid });
  const entry: ManagedProcessEntry = { kind, process };
  managedProcesses.add(entry);
  const unregister = () => managedProcesses.delete(entry);
  process.once("exit", unregister);
  process.once("error", unregister);
  return unregister;
}

export async function stopManagedProcesses(timeoutMs = 3000): Promise<void> {
  logger.info("Stopping managed processes", { count: managedProcesses.size });
  await Promise.all(
    Array.from(managedProcesses).map(
      ({ kind, process }) =>
        new Promise<void>((resolve) => {
          if (process.killed || process.exitCode !== null) {
            resolve();
            return;
          }
          const timeout = setTimeout(() => {
            if (!process.killed && process.exitCode === null) {
              console.warn(`Force killing managed ${kind} process ${process.pid ?? ""}`.trim());
              logger.warn("Force killing managed process", { kind, pid: process.pid });
              process.kill("SIGKILL");
            }
            resolve();
          }, timeoutMs);
          process.once("exit", () => {
            clearTimeout(timeout);
            resolve();
          });
          process.kill("SIGTERM");
        })
    )
  );
  managedProcesses.clear();
}

async function cleanupBeforeQuit(): Promise<void> {
  logger.info("Running quit cleanup");
  setRecordingState({ status: "idle" });
  if (hudHideTimer) {
    clearTimeout(hudHideTimer);
    hudHideTimer = null;
  }
  hudWindow?.destroy();
  hudWindow = null;
  globalShortcut.unregisterAll();
  await localApiServer?.stop();
  await modelManager?.stopManagedModels();
  await stopManagedProcesses();
  settingsStore?.save();
}

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    logger.info("Second app instance requested; focusing existing window");
    void createWindow();
  });

app.whenReady().then(async () => {
  initLogger(getLogPath());
  logger.info("BriefInk app ready", { version: app.getVersion(), userData: app.getPath("userData") });
  configurePermissions();
  settingsStore = new SettingsStore(getSettingsPath());
    historyStore = new HistoryStore(getHistoryPath());
    modelManager = new ModelManager(userDataPath("models"), getModelStatePath());
    provider = createTranscriptionProvider(modelManager);
    localApiServer = new LocalApiServer(() => settingsStore.get(), modelManager, provider);

    registerIpc();
    await createWindow();
    await createHudWindow();
    registerHotkey(settingsStore.get().hotkey);

    if (settingsStore.get().autoStartDefaultModel) {
      await modelManager.start(modelManager.getDefault().id);
    }
    if (settingsStore.get().localApi.enabled) {
      await localApiServer.start().catch((error) => {
        logger.error("Failed to auto-start local API server", error);
        settingsStore.update({ localApi: { enabled: false } });
      });
    }
  });
}

app.on("activate", () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    focusMainWindow();
    return;
  }
  void createWindow();
});

app.on("before-quit", (event) => {
  if (isQuitting) return;
  event.preventDefault();
  isQuitting = true;
  cleanupBeforeQuit()
    .catch((error) => logger.error("BriefInk quit cleanup failed", error))
    .finally(() => app.quit());
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
