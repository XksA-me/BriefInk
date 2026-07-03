import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Clipboard,
  Database,
  Edit3,
  FolderOpen,
  History,
  KeyRound,
  Mic,
  PauseCircle,
  PlayCircle,
  Radio,
  RefreshCw,
  Server,
  Settings,
  Square,
  Trash2,
  Waves,
  X
} from "lucide-react";
import type { AppSettings, BriefInkSnapshot, CloudProviderConfig, LanguageCode, RecordingState, SpeechModel } from "../shared/types";

type Page = "model" | "record" | "history" | "settings";
type AudioDeviceOption = { deviceId: string; label: string };

const languageOptions: Array<{ value: LanguageCode; label: string }> = [
  { value: "auto", label: "Auto Detect" },
  { value: "same", label: "Same as spoken language" },
  { value: "zh", label: "Chinese" },
  { value: "en", label: "English" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" }
];

const nav = [
  { id: "model", label: "Model", icon: Database },
  { id: "record", label: "Record", icon: Mic },
  { id: "history", label: "History", icon: History },
  { id: "settings", label: "Settings", icon: Settings }
] satisfies Array<{ id: Page; label: string; icon: typeof Database }>;

export function App() {
  const [page, setPage] = useState<Page>("model");
  const [snapshot, setSnapshot] = useState<BriefInkSnapshot | null>(null);
  const [busyModel, setBusyModel] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const recordingTimeout = useRef<number | null>(null);

  const refresh = async () => setSnapshot(await window.briefInk.getSnapshot());

  useEffect(() => {
    void refresh();
    return window.briefInk.onRecordingState((recording) => {
      setSnapshot((current) => (current ? { ...current, recording } : current));
    });
  }, []);

  const toggleMicRecording = useCallback(async () => {
    if (recorder.current?.state === "recording") {
      recorder.current.stop();
      return;
    }

    try {
      setPermissionError(null);
      const hasAccess = await window.briefInk.requestMicrophoneAccess();
      if (!hasAccess) {
        throw new Error("Microphone access is not granted. Open macOS System Settings > Privacy & Security > Microphone and enable BriefInk.");
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("This Electron window cannot access navigator.mediaDevices.getUserMedia.");
      }

      const inputDeviceId = snapshot?.settings.recording.inputDeviceId ?? "default";
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: inputDeviceId === "default"
          ? { echoCancellation: false, noiseSuppression: false, autoGainControl: true }
          : { deviceId: { exact: inputDeviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: true }
      });
      const mediaRecorder = new MediaRecorder(stream);
      chunks.current = [];
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.current.push(event.data);
      };
      mediaRecorder.onstop = async () => {
        if (recordingTimeout.current) {
          window.clearTimeout(recordingTimeout.current);
          recordingTimeout.current = null;
        }
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunks.current, { type: mediaRecorder.mimeType || "audio/webm" });
        try {
          const { wav, stats } = await webmBlobToWav(blob);
          if (stats.peak < 0.01 || stats.rms < 0.0015) {
            throw new Error(`No microphone signal detected (peak ${stats.peak.toFixed(4)}, rms ${stats.rms.toFixed(4)}). Check BriefInk microphone permission and selected input device.`);
          }
          const state = await window.briefInk.transcribeBlob(await wav.arrayBuffer(), wav.type);
          setSnapshot((current) => (current ? { ...current, recording: state } : current));
          await refreshSnapshot(setSnapshot);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Recording conversion or transcription failed.";
          setPermissionError(message);
          setNotice(message);
          window.setTimeout(() => setNotice(null), 4200);
        } finally {
          recorder.current = null;
        }
      };
      recorder.current = mediaRecorder;
      const state = await window.briefInk.startRecording();
      setSnapshot((current) => (current ? { ...current, recording: state } : current));
      mediaRecorder.start();
      const maxDuration = Math.max(1, snapshot?.settings.recording.maxDurationSeconds ?? 600);
      recordingTimeout.current = window.setTimeout(() => {
        if (recorder.current?.state === "recording") recorder.current.stop();
      }, maxDuration * 1000);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Microphone permission failed.";
      setPermissionError(message);
      setNotice(message);
      window.setTimeout(() => setNotice(null), 4200);
    }
  }, [snapshot?.settings.recording.inputDeviceId, snapshot?.settings.recording.maxDurationSeconds]);

  useEffect(() => window.briefInk.onHotkeyToggle(() => void toggleMicRecording()), [toggleMicRecording]);

  const defaultModel = useMemo(() => snapshot?.models.find((model) => model.default), [snapshot?.models]);

  async function modelAction(kind: "download" | "start" | "stop" | "default", action: (id: string) => Promise<SpeechModel[]>, id: string) {
    setBusyModel(id);
    setNotice(modelActionNotice(kind));
    setSnapshot((current) => {
      if (!current) return current;
      return {
        ...current,
        models: current.models.map((model) => {
          if (model.id !== id) return model;
          if (kind === "download") return { ...model, status: "downloading" };
          if (kind === "start") return { ...model, status: "running" };
          if (kind === "stop") return { ...model, status: "stopped" };
          return model;
        })
      };
    });
    try {
      const models = await action(id);
      setSnapshot((current) => (current ? { ...current, models } : current));
      setNotice("Model state updated.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Model action failed.";
      setNotice(message);
      await refresh();
    } finally {
      setBusyModel(null);
      window.setTimeout(() => setNotice(null), 4200);
    }
  }

  async function updateSettings(patch: Partial<AppSettings>) {
    const settings = await window.briefInk.updateSettings(patch);
    setSnapshot((current) => (current ? { ...current, settings } : current));
  }

  if (!snapshot) {
    return <div className="boot">Loading BriefInk...</div>;
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandMark">
            <Waves size={20} />
          </div>
          <div>
            <strong>BriefInk</strong>
            <span>Speech to text</span>
          </div>
        </div>

        <nav>
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} className={page === item.id ? "navItem active" : "navItem"} onClick={() => setPage(item.id)}>
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="sidebarFooter subtleFooter">
          <span>BriefInk {snapshot.settings.appearance?.language === "zh-CN" ? "开源版" : "Open Source"}</span>
        </div>
      </aside>

      <main className="main">
        {notice && <div className="toast">{notice}</div>}
        {page === "model" && (
          <ModelPage
            snapshot={snapshot}
            busyModel={busyModel}
            updateSettings={updateSettings}
            onDownload={(id) => modelAction("download", window.briefInk.downloadModel, id)}
            onStart={(id) => modelAction("start", window.briefInk.startModel, id)}
            onStop={(id) => modelAction("stop", window.briefInk.stopModel, id)}
            onDefault={(id) => modelAction("default", window.briefInk.setDefaultModel, id)}
            onConfigure={async (id, config) => {
              const models = await window.briefInk.configureModel(id, config);
              setSnapshot((current) => (current ? { ...current, models } : current));
            }}
          />
        )}
        {page === "record" && <RecordPage snapshot={snapshot} permissionError={permissionError} toggleMicRecording={toggleMicRecording} />}
        {page === "history" && <HistoryPage snapshot={snapshot} setSnapshot={setSnapshot} />}
        {page === "settings" && <SettingsPage snapshot={snapshot} updateSettings={updateSettings} setSnapshot={setSnapshot} />}
      </main>
      <RecordingHud recording={snapshot.recording} onOpenRecord={() => setPage("record")} />
    </div>
  );
}

function modelActionNotice(kind: "download" | "start" | "stop" | "default") {
  if (kind === "download") return "Preparing model files...";
  if (kind === "start") return "Starting local model service...";
  if (kind === "stop") return "Stopping model service...";
  return "Updating model...";
}

function ModelPage({
  snapshot,
  busyModel,
  updateSettings,
  onDownload,
  onStart,
  onStop,
  onDefault,
  onConfigure
}: {
  snapshot: BriefInkSnapshot;
  busyModel: string | null;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  onDownload: (id: string) => Promise<void>;
  onStart: (id: string) => Promise<void>;
  onStop: (id: string) => Promise<void>;
  onDefault: (id: string) => Promise<void>;
  onConfigure: (id: string, config: CloudProviderConfig) => Promise<void>;
}) {
  return (
    <section className="page">
      <PageHeader
        eyebrow="Model"
        title="Choose the voice model"
        description="One default model powers hotkey transcription and the local API."
      />

      <div className="topPanel">
        <div>
          <span className="label">Active Model</span>
          <strong>{snapshot.models.find((model) => model.default)?.name}</strong>
        </div>
        <Select
          label="Recognition Language"
          value={snapshot.settings.language.recognitionLanguage}
          options={languageOptions.filter((option) => option.value !== "same")}
          onChange={(value) => updateSettings({ language: { ...snapshot.settings.language, recognitionLanguage: value as LanguageCode } })}
        />
        <Select
          label="Output Language"
          value={snapshot.settings.language.outputLanguage}
          options={languageOptions.filter((option) => option.value !== "auto")}
          onChange={(value) => updateSettings({ language: { ...snapshot.settings.language, outputLanguage: value as LanguageCode } })}
        />
      </div>

      <div className="modelGrid">
        {snapshot.models.map((model) => (
          <ModelCard
            key={model.id}
            model={model}
            busy={busyModel === model.id}
            onDownload={onDownload}
            onStart={onStart}
            onStop={onStop}
            onDefault={onDefault}
            onConfigure={onConfigure}
          />
        ))}
      </div>
    </section>
  );
}

function ModelCard({
  model,
  busy,
  onDownload,
  onStart,
  onStop,
  onDefault,
  onConfigure
}: {
  model: SpeechModel;
  busy: boolean;
  onDownload: (id: string) => Promise<void>;
  onStart: (id: string) => Promise<void>;
  onStop: (id: string) => Promise<void>;
  onDefault: (id: string) => Promise<void>;
  onConfigure: (id: string, config: CloudProviderConfig) => Promise<void>;
}) {
  const [openConfig, setOpenConfig] = useState(false);
  const isCloud = model.kind !== "local";
  const statusText = modelStatusText(model, busy);

  return (
    <article className={model.default ? "modelCard selected" : "modelCard"}>
      <div className="cardHead">
        <div>
          <div className="modelName">{model.name}</div>
          <div className="muted">{model.kind.toUpperCase()} · {model.languageCapability} · {model.sizeLabel}</div>
        </div>
        <StatusBadge status={model.status} />
      </div>

      <div className="scoreRow">
        <Metric label="Speed" value={model.speedScore} />
        <Metric label="Accuracy" value={model.accuracyScore} />
      </div>

      <div className="modelRuntime">
        <span className={`runtimeDot ${model.status}`} />
        <span>{statusText}</span>
      </div>
      {busy && <div className="progressRail"><span /></div>}

      <div className="cardActions">
        {model.status === "running" ? (
          <button className="secondaryButton" disabled={busy} onClick={() => onStop(model.id)}>
            <Square size={16} /> Stop
          </button>
        ) : model.status === "not_installed" && !isCloud ? (
          <button className="primaryButton" disabled={busy} onClick={() => onDownload(model.id)}>
            <RefreshCw size={16} /> Download
          </button>
        ) : (
          <button className="primaryButton" disabled={busy} onClick={() => onStart(model.id)}>
            <PlayCircle size={16} /> Start
          </button>
        )}
        {isCloud && (
          <button className="ghostButton" onClick={() => setOpenConfig((value) => !value)}>
            <KeyRound size={16} /> Configure
          </button>
        )}
        <button className="ghostButton" disabled={model.default} onClick={() => onDefault(model.id)}>
          <Check size={16} /> {model.default ? "Selected" : "Use"}
        </button>
      </div>

      {openConfig && <ProviderConfigDialog model={model} onClose={() => setOpenConfig(false)} onConfigure={onConfigure} />}
    </article>
  );
}

function ProviderConfigDialog({
  model,
  onClose,
  onConfigure
}: {
  model: SpeechModel;
  onClose: () => void;
  onConfigure: (id: string, config: CloudProviderConfig) => Promise<void>;
}) {
  const [provider, setProvider] = useState(model.config?.provider ?? "Custom");
  const [baseUrl, setBaseUrl] = useState(model.config?.baseUrl ?? model.config?.endpoint ?? "");
  const [apiKey, setApiKey] = useState(model.config?.apiKey ?? "");
  const [modelName, setModelName] = useState(model.config?.modelName ?? model.config?.model ?? "whisper-large-v3-turbo");
  const [timeoutMs, setTimeoutMs] = useState(model.config?.timeoutMs ?? 120000);

  return (
    <div className="modalBackdrop" role="presentation" onClick={onClose}>
      <section className="configModal" role="dialog" aria-modal="true" aria-label="Provider configuration" onClick={(event) => event.stopPropagation()}>
        <header className="modalHeader">
          <div>
            <span>Provider Configuration</span>
            <h2>{model.name}</h2>
          </div>
          <button className="iconButton smallIconButton" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="modalGrid">
          <label>
            Provider
            <select value={provider} onChange={(event) => setProvider(event.target.value)}>
              <option value="Custom">Custom</option>
              <option value="OpenAI">OpenAI</option>
              <option value="Groq">Groq</option>
              <option value="Deepgram">Deepgram</option>
            </select>
          </label>
          <label>
            Base URL
            <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://api.example.com" />
          </label>
          <label>
            API Key
            <input value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="sk-..." type="password" />
          </label>
          <label>
            Model Name
            <input value={modelName} onChange={(event) => setModelName(event.target.value)} placeholder="whisper-large-v3-turbo" />
          </label>
          <label>
            Timeout
            <input type="number" min={1000} step={1000} value={timeoutMs} onChange={(event) => setTimeoutMs(Number(event.target.value) || 120000)} />
          </label>
        </div>
        <div className="modalActions">
          <button className="ghostButton" onClick={onClose}>Cancel</button>
          <button
            className="primaryButton"
            onClick={async () => {
              await onConfigure(model.id, { provider, baseUrl, endpoint: baseUrl, apiKey, model: modelName, modelName, timeoutMs });
              onClose();
            }}
          >
            Save
          </button>
        </div>
      </section>
    </div>
  );
}

function RecordPage({
  snapshot,
  permissionError,
  toggleMicRecording
}: {
  snapshot: BriefInkSnapshot;
  permissionError: string | null;
  toggleMicRecording: () => Promise<void>;
}) {
  const elapsed = useElapsedSeconds(snapshot.recording);

  return (
    <section className="page">
      <PageHeader eyebrow="Record" title="Speak, stop, copy" description="Use Option + Space anywhere, or record from this page." />
      <div className="recordLayout">
        <div className="recordPanel">
          <div className={`pulse ${snapshot.recording.status}`}><Radio size={34} /></div>
          <Waveform active={snapshot.recording.status === "recording"} />
          <h2>{recordingTitle(snapshot.recording)}</h2>
          <p>{snapshot.recording.modelName}</p>
          <div className="recordTimer">{formatDuration(elapsed)}</div>
          <button className={snapshot.recording.status === "recording" ? "dangerButton" : "primaryButton large"} onClick={toggleMicRecording}>
            {snapshot.recording.status === "recording" ? <PauseCircle size={20} /> : <Mic size={20} />}
            {snapshot.recording.status === "recording" ? "Stop Recording" : "Start Recording"}
          </button>
          {permissionError && <div className="errorText">{permissionError}</div>}
        </div>
        <div className="resultPanel">
          <div className="resultHeader">
            <span className="label">Latest Result</span>
            {snapshot.recording.lastResult && (
              <button
                className="ghostButton compactButton"
                onClick={() => navigator.clipboard.writeText(snapshot.recording.lastResult?.translatedText ?? snapshot.recording.lastResult?.text ?? "")}
              >
                <Clipboard size={15} /> Copy
              </button>
            )}
          </div>
          <div className={snapshot.recording.lastResult ? "resultText hasResult" : "resultText"}>
            {snapshot.recording.status === "transcribing"
              ? "Transcribing audio..."
              : snapshot.recording.lastResult?.translatedText ?? snapshot.recording.lastResult?.text ?? "No transcription yet."}
          </div>
          {snapshot.recording.lastResult?.translatedText && (
            <>
              <span className="label">Original</span>
              <div className="sourceText">{snapshot.recording.lastResult.text}</div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function HistoryPage({ snapshot, setSnapshot }: { snapshot: BriefInkSnapshot; setSnapshot: React.Dispatch<React.SetStateAction<BriefInkSnapshot | null>> }) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");
  const [draftTranslatedText, setDraftTranslatedText] = useState("");

  async function clearHistory() {
    if (!snapshot.history.length) return;
    if (!window.confirm("Clear all history records and their saved audio files?")) return;
    const history = await window.briefInk.clearHistory();
    setSnapshot((current) => (current ? { ...current, history } : current));
    setSelectedIds([]);
  }

  async function deleteHistory(id: string) {
    if (!window.confirm("Delete this history record and its saved audio file?")) return;
    const history = await window.briefInk.deleteHistory(id);
    setSnapshot((current) => (current ? { ...current, history } : current));
    setSelectedIds((current) => current.filter((selectedId) => selectedId !== id));
  }

  async function deleteSelected() {
    if (!selectedIds.length) return;
    if (!window.confirm(`Delete ${selectedIds.length} selected history records and their saved audio files?`)) return;
    const history = await window.briefInk.deleteHistoryMany(selectedIds);
    setSnapshot((current) => (current ? { ...current, history } : current));
    setSelectedIds([]);
  }

  async function saveEdit(id: string) {
    const history = await window.briefInk.updateHistory(id, {
      text: draftText,
      translatedText: draftTranslatedText.trim() ? draftTranslatedText : undefined
    });
    setSnapshot((current) => (current ? { ...current, history } : current));
    setEditingId(null);
    setDraftText("");
    setDraftTranslatedText("");
  }

  function startEdit(entry: BriefInkSnapshot["history"][number]) {
    setEditingId(entry.id);
    setDraftText(entry.text);
    setDraftTranslatedText(entry.translatedText ?? "");
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  return (
    <section className="page">
      <PageHeader eyebrow="History" title="Recent text history" description="History is optional and controlled from Settings." />
      <div className="historyToolbar">
        <div className="historyMeta">
          <span>{snapshot.history.length} records</span>
          {selectedIds.length > 0 && <strong>{selectedIds.length} selected</strong>}
        </div>
        <div className="toolbarActions">
          <button className="ghostButton" onClick={() => void window.briefInk.openRecordingsDirectory()}>
            <FolderOpen size={16} /> Audio Folder
          </button>
          <button className="ghostButton" disabled={!selectedIds.length} onClick={deleteSelected}>
            <Trash2 size={16} /> Delete Selected
          </button>
          <button className="ghostButton" onClick={clearHistory}>
            <Trash2 size={16} /> Clear
          </button>
        </div>
      </div>
      <div className="historyList">
        {snapshot.history.length === 0 ? (
          <div className="emptyState">No saved history. Enable text history in Settings when you want a local trail.</div>
        ) : (
          snapshot.history.map((entry) => (
            <article className="historyItem" key={entry.id}>
              <input className="historyCheckbox" type="checkbox" checked={selectedIds.includes(entry.id)} onChange={() => toggleSelected(entry.id)} aria-label="Select history record" />
              <div className="historyContent">
                <strong>{entry.modelName}</strong>
                <span>{new Date(entry.createdAt).toLocaleString()} · {entry.duration.toFixed(1)}s</span>
                {editingId === entry.id ? (
                  <div className="editStack">
                    <label>
                      Text
                      <textarea value={draftText} onChange={(event) => setDraftText(event.target.value)} />
                    </label>
                    <label>
                      Translated Text
                      <textarea value={draftTranslatedText} onChange={(event) => setDraftTranslatedText(event.target.value)} placeholder="Optional" />
                    </label>
                    <div className="inlineActions">
                      <button className="primaryButton" onClick={() => void saveEdit(entry.id)}>Save</button>
                      <button className="ghostButton" onClick={() => setEditingId(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <p>{entry.translatedText ?? entry.text}</p>
                )}
                {entry.audioPath && (
                  <audio className="historyAudio" controls src={filePathToUrl(entry.audioPath)}>
                    Audio playback is not available in this browser.
                  </audio>
                )}
              </div>
              <div className="historyActions">
                <button className="iconButton" aria-label="Copy text" onClick={() => navigator.clipboard.writeText(entry.translatedText ?? entry.text)}>
                  <Clipboard size={18} />
                </button>
                <button className="iconButton" aria-label="Edit text" onClick={() => startEdit(entry)}>
                  <Edit3 size={18} />
                </button>
                <button className="iconButton" aria-label="Delete record" onClick={() => void deleteHistory(entry.id)}>
                  <Trash2 size={18} />
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function SettingsPage({
  snapshot,
  updateSettings,
  setSnapshot
}: {
  snapshot: BriefInkSnapshot;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  setSnapshot: React.Dispatch<React.SetStateAction<BriefInkSnapshot | null>>;
}) {
  const settings = snapshot.settings;
  const [capturingHotkey, setCapturingHotkey] = useState(false);
  const [pendingHotkey, setPendingHotkey] = useState<string | null>(null);
  const [microphoneAccess, setMicrophoneAccess] = useState<string>("unknown");
  const [accessibilityAccess, setAccessibilityAccess] = useState<boolean>(false);
  const [audioDevices, setAudioDevices] = useState<AudioDeviceOption[]>([{ deviceId: "default", label: "System Default" }]);

  const refreshAudioDevices = useCallback(async () => {
    const access = await window.briefInk.getMicrophoneAccess();
    setMicrophoneAccess(access);
    if (access === "not-determined") {
      await window.briefInk.requestMicrophoneAccess();
      setMicrophoneAccess(await window.briefInk.getMicrophoneAccess());
    }
    setAccessibilityAccess(await window.briefInk.getAccessibilityAccess());
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const devices = await navigator.mediaDevices.enumerateDevices();
    const inputs = devices
      .filter((device) => device.kind === "audioinput")
      .map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || `Microphone ${index + 1}`
      }));
    setAudioDevices([{ deviceId: "default", label: "System Default" }, ...inputs]);
  }, []);

  useEffect(() => {
    if (!capturingHotkey) return;
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const next = formatHotkey(event);
      if (next) setPendingHotkey(next);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [capturingHotkey]);

  useEffect(() => {
    void refreshAudioDevices();
  }, [refreshAudioDevices]);

  return (
    <section className="page">
      <PageHeader eyebrow="Settings" title="Control the workflow" description="Keep privacy and local API behavior explicit." />
      <div className="settingsGrid">
        <SettingsGroup title="Hotkey">
          <div className="hotkeyCapture">
            <span>Start / Stop Recording</span>
            <button className={capturingHotkey ? "hotkeyButton capturing" : "hotkeyButton"} onClick={() => setCapturingHotkey(true)}>
              {capturingHotkey ? pendingHotkey ?? "Press a key combination..." : settings.hotkey}
            </button>
            {capturingHotkey && (
              <div className="hotkeyActions">
                <button
                  className="primaryButton"
                  disabled={!pendingHotkey}
                  onClick={async () => {
                    if (!pendingHotkey) return;
                    await updateSettings({ hotkey: pendingHotkey });
                    setCapturingHotkey(false);
                    setPendingHotkey(null);
                  }}
                >
                  Confirm
                </button>
                <button
                  className="ghostButton"
                  onClick={() => {
                    setCapturingHotkey(false);
                    setPendingHotkey(null);
                  }}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </SettingsGroup>
        <SettingsGroup title="Recording">
          <label>
            Input Device
            <select
              value={settings.recording.inputDeviceId}
              onChange={(event) => updateSettings({ recording: { ...settings.recording, inputDeviceId: event.target.value } })}
            >
              {audioDevices.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>{device.label}</option>
              ))}
            </select>
          </label>
          <label>
            Max Duration
            <input
              type="number"
              min={1}
              max={3600}
              value={settings.recording.maxDurationSeconds}
              onChange={(event) => updateSettings({ recording: { ...settings.recording, maxDurationSeconds: Number(event.target.value) || 600 } })}
            />
          </label>
          <div className="permissionRow">
            <span>Microphone: {microphoneAccess}</span>
            <button className="ghostButton" onClick={() => void refreshAudioDevices()}>
              <RefreshCw size={16} /> Refresh
            </button>
          </div>
        </SettingsGroup>
        <SettingsGroup title="Output">
          <Toggle label="Copy to clipboard" checked={settings.output.autoCopy} onChange={(autoCopy) => updateSettings({ output: { ...settings.output, autoCopy } })} />
          <Toggle
            label="Paste into frontmost app"
            checked={settings.output.autoPaste}
            onChange={async (autoPaste) => {
              if (autoPaste) {
                const granted = await window.briefInk.requestAccessibilityAccess();
                setAccessibilityAccess(granted);
                if (!granted) return;
              }
              await updateSettings({ output: { ...settings.output, autoPaste } });
            }}
          />
          <Toggle label="Show notification" checked={settings.output.showNotification} onChange={(showNotification) => updateSettings({ output: { ...settings.output, showNotification } })} />
          <div className="permissionRow">
            <span>Accessibility: {accessibilityAccess ? "granted" : "needed for auto paste"}</span>
            <button className="ghostButton" onClick={async () => setAccessibilityAccess(await window.briefInk.requestAccessibilityAccess())}>
              <RefreshCw size={16} /> Check
            </button>
          </div>
        </SettingsGroup>
        <SettingsGroup title="History">
          <Toggle label="Save text history" checked={settings.history.saveHistory} onChange={(saveHistory) => updateSettings({ history: { ...settings.history, saveHistory } })} />
          <Toggle label="Save audio files" checked={settings.history.saveAudio} onChange={(saveAudio) => updateSettings({ history: { ...settings.history, saveAudio } })} />
        </SettingsGroup>
        <SettingsGroup title="Local API">
          <Toggle
            label="Enable API server"
            checked={settings.localApi.enabled}
            onChange={async (enabled) => {
              const next = enabled ? await window.briefInk.startLocalApi() : await window.briefInk.stopLocalApi();
              setSnapshot((current) => (current ? { ...current, settings: next, localApiRunning: enabled } : current));
            }}
          />
          <label>
            Endpoint
            <input readOnly value={`http://${settings.localApi.host}:${settings.localApi.port}/v1/audio/transcriptions`} />
          </label>
          <label>
            API Key
            <input readOnly value={settings.localApi.apiKey} />
          </label>
          <div className="apiStatus"><Server size={16} /> {snapshot.localApiRunning ? "Running on 127.0.0.1" : "Stopped"}</div>
        </SettingsGroup>
        <SettingsGroup title="Diagnostics">
          <label>
            Language
            <select
              value={settings.appearance?.language ?? "en"}
              onChange={(event) => updateSettings({ appearance: { language: event.target.value as "en" | "zh-CN" } })}
            >
              <option value="en">English</option>
              <option value="zh-CN">中文简体</option>
            </select>
          </label>
          <div className="versionRow">
            <span>Version</span>
            <strong>{snapshot.appVersion}</strong>
          </div>
          <button className="ghostButton wideButton" onClick={() => void window.briefInk.openLogsDirectory()}>
            <FolderOpen size={16} /> Open logs folder
          </button>
          <div className="hintText">Logs are written to the app data directory and rotate at 2 MB.</div>
        </SettingsGroup>
      </div>
    </section>
  );
}

function PageHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <header className="pageHeader">
      <span>{eyebrow}</span>
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
  );
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void }) {
  return (
    <label className="selectLabel">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value.toFixed(1)} / 10</strong>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`status ${status}`}>{status.replace("_", " ")}</span>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="toggle">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function SettingsGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="settingsGroup">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function recordingTitle(state: RecordingState) {
  if (state.status === "recording") return "Recording...";
  if (state.status === "transcribing") return "Transcribing...";
  if (state.status === "completed") return "Copied to clipboard";
  if (state.status === "error") return state.error ?? "Something went wrong";
  return "Ready";
}

function modelStatusText(model: SpeechModel, busy: boolean) {
  if (busy && model.status === "not_installed") return "Downloading model file and preparing runtime...";
  if (busy) return "Applying model state change...";
  if (model.status === "running") return model.engine === "whisper.cpp" ? "Ready for local transcription" : "Running";
  if (model.status === "installed") return model.runtimeNote ?? "Configured and ready to start";
  if (model.status === "stopped") return "Stopped";
  if (model.status === "not_installed") return model.downloadUrl ? "Model file has not been downloaded" : "Not configured";
  if (model.status === "downloading") return "Downloading...";
  return model.error ?? "Needs attention";
}

function RecordingHud({ recording, onOpenRecord }: { recording: RecordingState; onOpenRecord: () => void }) {
  const elapsed = useElapsedSeconds(recording);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!["recording", "transcribing", "completed", "error"].includes(recording.status)) {
      setVisible(false);
      return;
    }
    setVisible(true);
    if (recording.status === "completed" || recording.status === "error") {
      const timeout = window.setTimeout(() => setVisible(false), 4000);
      return () => window.clearTimeout(timeout);
    }
  }, [recording.status, recording.updatedAt]);

  if (!visible) return null;

  return (
    <button className={`recordingHud ${recording.status}`} onClick={onOpenRecord}>
      <div className="hudIcon">
        {recording.status === "recording" ? <Mic size={18} /> : recording.status === "transcribing" ? <RefreshCw size={18} /> : <Check size={18} />}
      </div>
      <div>
        <strong>{recordingTitle(recording)}</strong>
        <span>{recording.status === "recording" ? formatDuration(elapsed) : recording.modelName ?? "BriefInk"}</span>
      </div>
      {recording.status === "recording" && <Waveform active compact />}
    </button>
  );
}

function Waveform({ active, compact = false }: { active: boolean; compact?: boolean }) {
  return (
    <div className={compact ? "waveform compact" : "waveform"} aria-hidden="true">
      {Array.from({ length: 9 }).map((_, index) => (
        <span key={index} className={active ? "active" : ""} style={{ animationDelay: `${index * 90}ms` }} />
      ))}
    </div>
  );
}

function useElapsedSeconds(recording: RecordingState) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (recording.status !== "recording") return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [recording.status, recording.startedAt]);

  if (recording.status !== "recording" || !recording.startedAt) {
    return recording.durationSeconds ?? 0;
  }

  return Math.max(0, Math.floor((now - new Date(recording.startedAt).getTime()) / 1000));
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function filePathToUrl(filePath: string) {
  return `file://${filePath.split("/").map((part) => encodeURIComponent(part)).join("/")}`;
}

async function refreshSnapshot(setSnapshot: React.Dispatch<React.SetStateAction<BriefInkSnapshot | null>>) {
  const snapshot = await window.briefInk.getSnapshot();
  setSnapshot(snapshot);
}

async function webmBlobToWav(blob: Blob): Promise<{ wav: Blob; stats: AudioStats }> {
  const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
  const context = new AudioContextClass({ sampleRate: 16000 });
  const arrayBuffer = await blob.arrayBuffer();
  const decoded = await context.decodeAudioData(arrayBuffer.slice(0));
  const samples = mixToMono(decoded);
  const resampled = decoded.sampleRate === 16000 ? samples : resampleLinear(samples, decoded.sampleRate, 16000);
  const stats = measureAudio(resampled);
  await context.close();
  return { wav: new Blob([encodeWav(resampled, 16000)], { type: "audio/wav" }), stats };
}

type AudioStats = { peak: number; rms: number };

function measureAudio(samples: Float32Array): AudioStats {
  let peak = 0;
  let sumSquares = 0;
  for (const sample of samples) {
    const value = Math.abs(sample);
    peak = Math.max(peak, value);
    sumSquares += sample * sample;
  }
  return {
    peak,
    rms: samples.length ? Math.sqrt(sumSquares / samples.length) : 0
  };
}

function mixToMono(audio: AudioBuffer): Float32Array {
  const output = new Float32Array(audio.length);
  for (let channel = 0; channel < audio.numberOfChannels; channel += 1) {
    const data = audio.getChannelData(channel);
    for (let index = 0; index < data.length; index += 1) {
      output[index] += data[index] / audio.numberOfChannels;
    }
  }
  return output;
}

function resampleLinear(input: Float32Array, sourceRate: number, targetRate: number): Float32Array {
  const ratio = sourceRate / targetRate;
  const length = Math.max(1, Math.round(input.length / ratio));
  const output = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    const position = index * ratio;
    const left = Math.floor(position);
    const right = Math.min(input.length - 1, left + 1);
    const weight = position - left;
    output[index] = input[left] * (1 - weight) + input[right] * weight;
  }
  return output;
}

function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (const sample of samples) {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }
  return buffer;
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function formatHotkey(event: KeyboardEvent): string | null {
  const key = normalizeKey(event.key);
  if (!key) return null;
  const modifiers = [
    event.ctrlKey ? "Control" : null,
    event.altKey ? "Option" : null,
    event.shiftKey ? "Shift" : null,
    event.metaKey ? "Command" : null
  ].filter(Boolean);
  if (modifiers.length === 0 && key.length === 1) return null;
  return [...modifiers, key].join("+");
}

function normalizeKey(key: string): string | null {
  if (["Control", "Alt", "Shift", "Meta", "OS"].includes(key)) return null;
  if (key === " ") return "Space";
  if (key === "Escape") return "Escape";
  if (key.length === 1) return key.toUpperCase();
  return key;
}
