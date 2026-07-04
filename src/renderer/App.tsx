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
  X
} from "lucide-react";
import type { AppSettings, BriefInkSnapshot, CloudProviderConfig, LanguageCode, RecordingState, SpeechModel } from "../shared/types";
import logoUrl from "./assets/lnkbrief_128.png";
import { createTranslator, type MessageKey } from "./i18n";

type Page = "model" | "record" | "history" | "settings";
type AudioDeviceOption = { deviceId: string; label: string };
type Translator = ReturnType<typeof createTranslator>;

const languageOptions: Array<{ value: LanguageCode; labelKey: MessageKey }> = [
  { value: "auto", labelKey: "languages.auto" },
  { value: "same", labelKey: "languages.same" },
  { value: "zh", labelKey: "languages.zh" },
  { value: "en", labelKey: "languages.en" },
  { value: "ja", labelKey: "languages.ja" },
  { value: "ko", labelKey: "languages.ko" },
  { value: "es", labelKey: "languages.es" },
  { value: "fr", labelKey: "languages.fr" },
  { value: "de", labelKey: "languages.de" }
];

const nav = [
  { id: "model", labelKey: "nav.model", icon: Database },
  { id: "record", labelKey: "nav.record", icon: Mic },
  { id: "history", labelKey: "nav.history", icon: History },
  { id: "settings", labelKey: "nav.settings", icon: Settings }
] satisfies Array<{ id: Page; labelKey: MessageKey; icon: typeof Database }>;

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
  const t = useMemo(() => createTranslator(snapshot?.settings.appearance?.language), [snapshot?.settings.appearance?.language]);

  useEffect(() => {
    void refresh();
    const unsubscribeRecording = window.briefInk.onRecordingState((recording) => {
      setSnapshot((current) => (current ? { ...current, recording } : current));
    });
    const unsubscribeModels = window.briefInk.onModelsChanged((models) => {
      setSnapshot((current) => (current ? { ...current, models } : current));
    });
    return () => {
      unsubscribeRecording();
      unsubscribeModels();
    };
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
        throw new Error(t("notices.micDenied"));
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(t("notices.mediaUnavailable"));
      }
      const devices = navigator.mediaDevices.enumerateDevices ? await navigator.mediaDevices.enumerateDevices() : [];
      if (!devices.some((device) => device.kind === "audioinput")) {
        throw new Error(t("notices.noInputDevice"));
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
            throw new Error(`${t("notices.noSignal")} (${stats.peak.toFixed(4)} / ${stats.rms.toFixed(4)})`);
          }
          const state = await window.briefInk.transcribeBlob(await wav.arrayBuffer(), wav.type);
          setSnapshot((current) => (current ? { ...current, recording: state } : current));
          await refreshSnapshot(setSnapshot);
        } catch (error) {
          const message = error instanceof Error ? error.message : t("notices.conversionFailed");
          setPermissionError(message);
          setNotice(message);
          await window.briefInk.reportRecordingError(message);
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
      const message = error instanceof Error ? error.message : t("notices.micFailed");
      setPermissionError(message);
      setNotice(message);
      await window.briefInk.reportRecordingError(message);
      window.setTimeout(() => setNotice(null), 4200);
    }
  }, [snapshot?.settings.recording.inputDeviceId, snapshot?.settings.recording.maxDurationSeconds, t]);

  useEffect(() => window.briefInk.onHotkeyToggle(() => void toggleMicRecording()), [toggleMicRecording]);

  async function modelAction(kind: "download" | "start" | "stop" | "default", action: (id: string) => Promise<SpeechModel[]>, id: string) {
    setBusyModel(id);
    setNotice(modelActionNotice(kind, t));
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
      setNotice(t("notices.modelUpdated"));
    } catch (error) {
      const message = error instanceof Error ? error.message : t("notices.modelFailed");
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
    return <div className="boot">{t("app.loading")}</div>;
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <img className="brandMark imageMark" src={logoUrl} alt="" />
          <div>
            <strong>BriefInk</strong>
            <span>{t("nav.record")}</span>
          </div>
        </div>

        <nav>
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} className={page === item.id ? "navItem active" : "navItem"} onClick={() => setPage(item.id)}>
                <Icon size={18} />
                {t(item.labelKey)}
              </button>
            );
          })}
        </nav>

        <div className="sidebarFooter subtleFooter">
          <span>BriefInk {t("app.openSource")}</span>
        </div>
      </aside>

      <main className="main">
        {notice && <div className="toast">{notice}</div>}
        {page === "model" && (
          <ModelPage
            snapshot={snapshot}
            busyModel={busyModel}
            updateSettings={updateSettings}
            t={t}
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
        {page === "record" && <RecordPage snapshot={snapshot} permissionError={permissionError} toggleMicRecording={toggleMicRecording} t={t} />}
        {page === "history" && <HistoryPage snapshot={snapshot} setSnapshot={setSnapshot} t={t} />}
        {page === "settings" && <SettingsPage snapshot={snapshot} updateSettings={updateSettings} setSnapshot={setSnapshot} t={t} />}
      </main>
      <RecordingHud recording={snapshot.recording} onOpenRecord={() => setPage("record")} t={t} />
    </div>
  );
}

function modelActionNotice(kind: "download" | "start" | "stop" | "default", t: Translator) {
  if (kind === "download") return t("notices.preparingModel");
  if (kind === "start") return t("notices.startingModel");
  if (kind === "stop") return t("notices.stoppingModel");
  return t("notices.updatingModel");
}

function ModelPage({
  snapshot,
  busyModel,
  updateSettings,
  onDownload,
  onStart,
  onStop,
  onDefault,
  onConfigure,
  t
}: {
  snapshot: BriefInkSnapshot;
  busyModel: string | null;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  onDownload: (id: string) => Promise<void>;
  onStart: (id: string) => Promise<void>;
  onStop: (id: string) => Promise<void>;
  onDefault: (id: string) => Promise<void>;
  onConfigure: (id: string, config: CloudProviderConfig) => Promise<void>;
  t: Translator;
}) {
  return (
    <section className="page">
      <PageHeader
        eyebrow={t("model.eyebrow")}
        title={t("model.title")}
        description={t("model.description")}
      />

      <div className="topPanel">
        <div>
          <span className="label">{t("model.activeModel")}</span>
          <strong>{snapshot.models.find((model) => model.default)?.name}</strong>
        </div>
        <Select
          label={t("model.recognitionLanguage")}
          value={snapshot.settings.language.recognitionLanguage}
          options={languageOptions.filter((option) => option.value !== "same").map((option) => ({ value: option.value, label: t(option.labelKey) }))}
          onChange={(value) => updateSettings({ language: { ...snapshot.settings.language, recognitionLanguage: value as LanguageCode } })}
        />
        <Select
          label={t("model.outputLanguage")}
          value={snapshot.settings.language.outputLanguage}
          options={languageOptions.filter((option) => option.value !== "auto").map((option) => ({ value: option.value, label: t(option.labelKey) }))}
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
            t={t}
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
  onConfigure,
  t
}: {
  model: SpeechModel;
  busy: boolean;
  onDownload: (id: string) => Promise<void>;
  onStart: (id: string) => Promise<void>;
  onStop: (id: string) => Promise<void>;
  onDefault: (id: string) => Promise<void>;
  onConfigure: (id: string, config: CloudProviderConfig) => Promise<void>;
  t: Translator;
}) {
  const [openConfig, setOpenConfig] = useState(false);
  const isCloud = model.kind !== "local";
  const statusText = modelStatusText(model, busy, t);
  const progress = model.downloadProgress;
  const isDownloading = model.status === "downloading" || (busy && Boolean(progress));
  const progressWidth = progress?.percent ?? (isDownloading ? 18 : 0);

  return (
    <article className={model.default ? "modelCard selected" : "modelCard"}>
      <div className="cardHead">
        <div>
          <div className="modelName">{model.name}</div>
          <div className="muted">{model.kind.toUpperCase()} · {model.languageCapability} · {model.sizeLabel}</div>
        </div>
        <StatusBadge status={model.status} t={t} />
      </div>

      <div className="scoreRow">
        <Metric label={t("model.speed")} value={model.speedScore} />
        <Metric label={t("model.accuracy")} value={model.accuracyScore} />
      </div>

      <div className="modelRuntime">
        <span className={`runtimeDot ${model.status}`} />
        <span>{statusText}</span>
      </div>
      {isDownloading && (
        <div className="downloadProgress">
          <div className="progressRail">
            <span style={{ width: `${progressWidth}%` }} />
          </div>
          <div className="progressMeta">
            <span>{progress?.percent !== undefined ? `${progress.percent}%` : t("status.downloading")}</span>
            <span>{formatBytes(progress?.receivedBytes)}{progress?.totalBytes ? ` / ${formatBytes(progress.totalBytes)}` : ""}</span>
          </div>
        </div>
      )}

      <div className="cardActions">
        {model.status === "running" ? (
          <button className="secondaryButton" disabled={busy} onClick={() => onStop(model.id)}>
            <Square size={16} /> {t("model.stop")}
          </button>
        ) : model.status === "not_installed" && !isCloud ? (
          <button className="primaryButton" disabled={busy} onClick={() => onDownload(model.id)}>
            <RefreshCw size={16} /> {t("model.download")}
          </button>
        ) : (
          <button className="primaryButton" disabled={busy} onClick={() => onStart(model.id)}>
            <PlayCircle size={16} /> {t("model.start")}
          </button>
        )}
        {isCloud && (
          <button className="ghostButton" onClick={() => setOpenConfig((value) => !value)}>
            <KeyRound size={16} /> {t("model.configure")}
          </button>
        )}
        <button className="ghostButton" disabled={model.default} onClick={() => onDefault(model.id)}>
          <Check size={16} /> {model.default ? t("common.selected") : t("common.use")}
        </button>
      </div>

      {openConfig && <ProviderConfigDialog model={model} onClose={() => setOpenConfig(false)} onConfigure={onConfigure} t={t} />}
    </article>
  );
}

function ProviderConfigDialog({
  model,
  onClose,
  onConfigure,
  t
}: {
  model: SpeechModel;
  onClose: () => void;
  onConfigure: (id: string, config: CloudProviderConfig) => Promise<void>;
  t: Translator;
}) {
  const [provider, setProvider] = useState(model.config?.provider ?? "openai-compatible");
  const [baseUrl, setBaseUrl] = useState(model.config?.baseUrl ?? model.config?.endpoint ?? "https://api.openai.com");
  const [apiKey, setApiKey] = useState(model.config?.apiKey ?? "");
  const [modelName, setModelName] = useState(model.config?.modelName ?? model.config?.model ?? "whisper-1");
  const [timeoutMs, setTimeoutMs] = useState(model.config?.timeoutMs ?? 120000);

  function changeProvider(nextProvider: string) {
    setProvider(nextProvider);
    if (nextProvider === "siliconflow") {
      setBaseUrl("https://api.siliconflow.cn");
      setModelName((current) => current && current !== "whisper-1" ? current : "FunAudioLLM/SenseVoiceSmall");
      return;
    }
    setBaseUrl((current) => current && current !== "https://api.siliconflow.cn" ? current : "https://api.openai.com");
    setModelName((current) => current && current !== "FunAudioLLM/SenseVoiceSmall" ? current : "whisper-1");
  }

  return (
    <div className="modalBackdrop" role="presentation" onClick={onClose}>
      <section className="configModal" role="dialog" aria-modal="true" aria-label={t("model.providerConfig")} onClick={(event) => event.stopPropagation()}>
        <header className="modalHeader">
          <div>
            <span>{t("model.providerConfig")}</span>
            <h2>{model.name}</h2>
          </div>
          <button className="iconButton smallIconButton" aria-label={t("common.close")} onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="modalGrid">
          <label>
            {t("model.provider")}
            <select value={provider} onChange={(event) => changeProvider(event.target.value)}>
              <option value="openai-compatible">{t("model.openaiCompatible")}</option>
              <option value="siliconflow">SiliconFlow</option>
            </select>
          </label>
          <label>
            {t("model.baseUrl")}
            <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder={provider === "siliconflow" ? "https://api.siliconflow.cn" : "https://api.openai.com"} />
          </label>
          <label>
            {t("model.apiKey")}
            <input value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="sk-..." type="password" />
          </label>
          <label>
            {t("model.modelName")}
            <input
              value={modelName}
              onChange={(event) => setModelName(event.target.value)}
              placeholder={provider === "siliconflow" ? "FunAudioLLM/SenseVoiceSmall" : "whisper-1"}
            />
          </label>
          <label>
            {t("model.timeout")}
            <input type="number" min={1000} step={1000} value={timeoutMs} onChange={(event) => setTimeoutMs(Number(event.target.value) || 120000)} />
          </label>
        </div>
        <div className="modalActions">
          <button className="ghostButton" onClick={onClose}>{t("common.cancel")}</button>
          <button
            className="primaryButton"
            onClick={async () => {
              await onConfigure(model.id, { provider, baseUrl, endpoint: baseUrl, apiKey, model: modelName, modelName, timeoutMs });
              onClose();
            }}
          >
            {t("common.save")}
          </button>
        </div>
      </section>
    </div>
  );
}

function RecordPage({
  snapshot,
  permissionError,
  toggleMicRecording,
  t
}: {
  snapshot: BriefInkSnapshot;
  permissionError: string | null;
  toggleMicRecording: () => Promise<void>;
  t: Translator;
}) {
  const elapsed = useElapsedSeconds(snapshot.recording);

  return (
    <section className="page">
      <PageHeader eyebrow={t("record.eyebrow")} title={t("record.title")} description={t("record.description")} />
      <div className="recordLayout">
        <div className="recordPanel">
          <div className={`pulse ${snapshot.recording.status}`}><Radio size={34} /></div>
          <Waveform active={snapshot.recording.status === "recording"} />
          <h2>{recordingTitle(snapshot.recording, t)}</h2>
          <p>{snapshot.recording.modelName}</p>
          <div className="recordTimer">{formatDuration(elapsed)}</div>
          <button className={snapshot.recording.status === "recording" ? "dangerButton" : "primaryButton large"} onClick={toggleMicRecording}>
            {snapshot.recording.status === "recording" ? <PauseCircle size={20} /> : <Mic size={20} />}
            {snapshot.recording.status === "recording" ? t("record.stop") : t("record.start")}
          </button>
          {permissionError && <div className="errorText">{permissionError}</div>}
        </div>
        <div className="resultPanel">
          <div className="resultHeader">
            <span className="label">{t("record.latestResult")}</span>
            {snapshot.recording.lastResult && (
              <button
                className="ghostButton compactButton"
                onClick={() => navigator.clipboard.writeText(snapshot.recording.lastResult?.translatedText ?? snapshot.recording.lastResult?.text ?? "")}
              >
                <Clipboard size={15} /> {t("common.copy")}
              </button>
            )}
          </div>
          <div className={snapshot.recording.lastResult ? "resultText hasResult" : "resultText"}>
            {snapshot.recording.status === "transcribing"
              ? t("record.transcribing")
              : snapshot.recording.lastResult?.translatedText ?? snapshot.recording.lastResult?.text ?? t("record.empty")}
          </div>
          {snapshot.recording.lastResult?.translatedText && (
            <>
              <span className="label">{t("record.original")}</span>
              <div className="sourceText">{snapshot.recording.lastResult.text}</div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function HistoryPage({ snapshot, setSnapshot, t }: { snapshot: BriefInkSnapshot; setSnapshot: React.Dispatch<React.SetStateAction<BriefInkSnapshot | null>>; t: Translator }) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");
  const [draftTranslatedText, setDraftTranslatedText] = useState("");

  async function clearHistory() {
    if (!snapshot.history.length) return;
    if (!window.confirm(t("history.confirmClear"))) return;
    const history = await window.briefInk.clearHistory();
    setSnapshot((current) => (current ? { ...current, history } : current));
    setSelectedIds([]);
  }

  async function deleteHistory(id: string) {
    if (!window.confirm(t("history.confirmDelete"))) return;
    const history = await window.briefInk.deleteHistory(id);
    setSnapshot((current) => (current ? { ...current, history } : current));
    setSelectedIds((current) => current.filter((selectedId) => selectedId !== id));
  }

  async function deleteSelected() {
    if (!selectedIds.length) return;
    if (!window.confirm(t("history.confirmDeleteSelected", { count: selectedIds.length }))) return;
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
      <PageHeader eyebrow={t("history.eyebrow")} title={t("history.title")} description={t("history.description")} />
      <div className="historyToolbar">
        <div className="historyMeta">
          <span>{snapshot.history.length} {t("history.records")}</span>
          {selectedIds.length > 0 && <strong>{selectedIds.length} {t("history.selected")}</strong>}
        </div>
        <div className="toolbarActions">
          <button className="ghostButton" onClick={() => void window.briefInk.openRecordingsDirectory()}>
            <FolderOpen size={16} /> {t("history.audioFolder")}
          </button>
          <button className="ghostButton" disabled={!selectedIds.length} onClick={deleteSelected}>
            <Trash2 size={16} /> {t("history.deleteSelected")}
          </button>
          <button className="ghostButton" onClick={clearHistory}>
            <Trash2 size={16} /> {t("common.clear")}
          </button>
        </div>
      </div>
      <div className="historyList">
        {snapshot.history.length === 0 ? (
          <div className="emptyState">{t("history.empty")}</div>
        ) : (
          snapshot.history.map((entry) => (
            <article className="historyItem" key={entry.id}>
              <input className="historyCheckbox" type="checkbox" checked={selectedIds.includes(entry.id)} onChange={() => toggleSelected(entry.id)} aria-label={t("history.selectRecord")} />
              <div className="historyContent">
                <strong>{entry.modelName}</strong>
                <span>{new Date(entry.createdAt).toLocaleString()} · {entry.duration.toFixed(1)}s</span>
                {editingId === entry.id ? (
                  <div className="editStack">
                    <label>
                      {t("history.text")}
                      <textarea value={draftText} onChange={(event) => setDraftText(event.target.value)} />
                    </label>
                    <label>
                      {t("history.translatedText")}
                      <textarea value={draftTranslatedText} onChange={(event) => setDraftTranslatedText(event.target.value)} placeholder={t("history.optional")} />
                    </label>
                    <div className="inlineActions">
                      <button className="primaryButton" onClick={() => void saveEdit(entry.id)}>{t("common.save")}</button>
                      <button className="ghostButton" onClick={() => setEditingId(null)}>{t("common.cancel")}</button>
                    </div>
                  </div>
                ) : (
                  <p>{entry.translatedText ?? entry.text}</p>
                )}
                {entry.audioPath && (
                  <audio className="historyAudio" controls src={filePathToUrl(entry.audioPath)}>
                    {t("history.audioUnavailable")}
                  </audio>
                )}
              </div>
              <div className="historyActions">
                <button className="iconButton" aria-label={t("common.copy")} onClick={() => navigator.clipboard.writeText(entry.translatedText ?? entry.text)}>
                  <Clipboard size={18} />
                </button>
                <button className="iconButton" aria-label={t("common.edit")} onClick={() => startEdit(entry)}>
                  <Edit3 size={18} />
                </button>
                <button className="iconButton" aria-label={t("common.delete")} onClick={() => void deleteHistory(entry.id)}>
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
  setSnapshot,
  t
}: {
  snapshot: BriefInkSnapshot;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  setSnapshot: React.Dispatch<React.SetStateAction<BriefInkSnapshot | null>>;
  t: Translator;
}) {
  const settings = snapshot.settings;
  const [capturingHotkey, setCapturingHotkey] = useState(false);
  const [pendingHotkey, setPendingHotkey] = useState<string | null>(null);
  const [microphoneAccess, setMicrophoneAccess] = useState<string>("unknown");
  const [accessibilityAccess, setAccessibilityAccess] = useState<boolean>(false);
  const [audioDevices, setAudioDevices] = useState<AudioDeviceOption[]>([{ deviceId: "default", label: t("settings.systemDefault") }]);
  const [checkingUpdates, setCheckingUpdates] = useState(false);

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
        label: device.label || t("settings.microphoneDevice", { index: index + 1 })
      }));
    setAudioDevices([{ deviceId: "default", label: t("settings.systemDefault") }, ...inputs]);
  }, [t]);

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

  async function checkForUpdates() {
    setCheckingUpdates(true);
    try {
      const result = await window.briefInk.checkForUpdates();
      if (result.updateAvailable) {
        const shouldOpen = window.confirm(t("settings.updateAvailable", {
          latest: result.latestVersion,
          current: result.currentVersion
        }));
        if (shouldOpen) {
          await window.briefInk.openExternalUrl(result.releaseUrl);
        }
        return;
      }
      window.alert(t("settings.upToDate", { current: result.currentVersion }));
    } catch {
      window.alert(t("settings.updateCheckFailed"));
    } finally {
      setCheckingUpdates(false);
    }
  }

  return (
    <section className="page">
      <PageHeader eyebrow={t("settings.eyebrow")} title={t("settings.title")} description={t("settings.description")} />
      <div className="settingsGrid">
        <div className="settingsColumn">
          <SettingsGroup title={t("settings.hotkey")}>
            <div className="hotkeyCapture">
              <span>{t("settings.startStopRecording")}</span>
              <button className={capturingHotkey ? "hotkeyButton capturing" : "hotkeyButton"} onClick={() => setCapturingHotkey(true)}>
                {capturingHotkey ? pendingHotkey ?? t("settings.pressCombination") : settings.hotkey}
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
                    {t("settings.confirm")}
                  </button>
                  <button
                    className="ghostButton"
                    onClick={() => {
                      setCapturingHotkey(false);
                      setPendingHotkey(null);
                    }}
                  >
                    {t("common.cancel")}
                  </button>
                </div>
              )}
            </div>
          </SettingsGroup>
          <SettingsGroup title={t("settings.output")}>
            <Toggle label={t("settings.copyClipboard")} checked={settings.output.autoCopy} onChange={(autoCopy) => updateSettings({ output: { ...settings.output, autoCopy } })} />
            <Toggle
              label={t("settings.pasteFrontmost")}
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
            <Toggle label={t("settings.showNotification")} checked={settings.output.showNotification} onChange={(showNotification) => updateSettings({ output: { ...settings.output, showNotification } })} />
            <div className="permissionRow">
              <span>{t("settings.accessibility")}: {accessibilityAccess ? t("settings.granted") : t("settings.accessibilityNeeded")}</span>
              <button className="ghostButton" onClick={async () => setAccessibilityAccess(await window.briefInk.requestAccessibilityAccess())}>
                <RefreshCw size={16} /> {t("common.refresh")}
              </button>
            </div>
          </SettingsGroup>
          <SettingsGroup title={t("settings.localApi")}>
            <Toggle
              label={t("settings.enableApi")}
              checked={settings.localApi.enabled}
              onChange={async (enabled) => {
                const next = enabled ? await window.briefInk.startLocalApi() : await window.briefInk.stopLocalApi();
                setSnapshot((current) => (current ? { ...current, settings: next, localApiRunning: enabled } : current));
              }}
            />
            <label>
              {t("settings.endpoint")}
              <input readOnly value={`http://${settings.localApi.host}:${settings.localApi.port}/v1/audio/transcriptions`} />
            </label>
            <label>
              {t("settings.apiKey")}
              <input readOnly value={settings.localApi.apiKey} />
            </label>
            <div className="apiStatus"><Server size={16} /> {snapshot.localApiRunning ? `${t("common.running")} 127.0.0.1` : t("common.stopped")}</div>
          </SettingsGroup>
          <SettingsGroup title={t("settings.project")}>
            <div className="infoBlock">
              <strong>{t("settings.projectName")}</strong>
              <span>{t("settings.projectDescription")}</span>
            </div>
            <div className="copyRow">
              <span>{t("settings.repository")}</span>
              <code>github.com/XksA-me/BriefInk</code>
            </div>
            <div className="inlineActions">
              <button className="ghostButton" onClick={() => void window.briefInk.openExternalUrl("https://github.com/XksA-me/BriefInk")}>
                <FolderOpen size={16} /> {t("settings.openRepository")}
              </button>
              <button className="primaryButton" disabled={checkingUpdates} onClick={() => void checkForUpdates()}>
                <RefreshCw size={16} /> {checkingUpdates ? t("common.refresh") : t("settings.checkUpdates")}
              </button>
            </div>
          </SettingsGroup>
        </div>
        <div className="settingsColumn">
          <SettingsGroup title={t("settings.recording")}>
            <label>
              {t("settings.inputDevice")}
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
              {t("settings.maxDuration")}
              <input
                type="number"
                min={1}
                max={3600}
                value={settings.recording.maxDurationSeconds}
                onChange={(event) => updateSettings({ recording: { ...settings.recording, maxDurationSeconds: Number(event.target.value) || 600 } })}
              />
            </label>
            <div className="permissionRow">
              <span>{t("settings.microphone")}: {microphoneAccess === "granted" ? t("settings.granted") : microphoneAccess}</span>
              <button className="ghostButton" onClick={() => void refreshAudioDevices()}>
                <RefreshCw size={16} /> {t("common.refresh")}
              </button>
            </div>
          </SettingsGroup>
          <SettingsGroup title={t("settings.history")}>
            <Toggle label={t("settings.saveTextHistory")} checked={settings.history.saveHistory} onChange={(saveHistory) => updateSettings({ history: { ...settings.history, saveHistory } })} />
            <Toggle label={t("settings.saveAudioFiles")} checked={settings.history.saveAudio} onChange={(saveAudio) => updateSettings({ history: { ...settings.history, saveAudio } })} />
          </SettingsGroup>
          <SettingsGroup title={t("settings.diagnostics")}>
            <label>
              {t("settings.language")}
              <select
                value={settings.appearance?.language ?? "en"}
                onChange={(event) => updateSettings({ appearance: { language: event.target.value as "en" | "zh-CN" } })}
              >
                <option value="en">{t("settings.english")}</option>
                <option value="zh-CN">{t("settings.simplifiedChinese")}</option>
              </select>
            </label>
            <div className="versionRow">
              <span>{t("settings.version")}</span>
              <strong>{snapshot.appVersion}</strong>
            </div>
            <button className="ghostButton wideButton" onClick={() => void window.briefInk.openLogsDirectory()}>
              <FolderOpen size={16} /> {t("settings.openLogs")}
            </button>
            <div className="hintText">{t("settings.logsHint")}</div>
          </SettingsGroup>
          <SettingsGroup title={t("settings.support")}>
            <div className="infoBlock">
              <strong>{t("settings.support")}</strong>
              <span>{t("settings.supportDescription")}</span>
            </div>
            <div className="copyRow">
              <span>{t("settings.wechat")}</span>
              <code>aibrief</code>
            </div>
            <div className="copyRow">
              <span>{t("settings.email")}</span>
              <code>zjhbrief@163.com</code>
            </div>
          </SettingsGroup>
        </div>
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

function StatusBadge({ status, t }: { status: string; t: Translator }) {
  return <span className={`status ${status}`}>{t(`status.${status}` as MessageKey)}</span>;
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

function recordingTitle(state: RecordingState, t: Translator) {
  if (state.status === "recording") return t("recording.recording");
  if (state.status === "transcribing") return t("recording.transcribing");
  if (state.status === "completed") return t("recording.completed");
  if (state.status === "error") return state.error ?? t("recording.error");
  return t("recording.ready");
}

function modelStatusText(model: SpeechModel, busy: boolean, t: Translator) {
  if (model.status === "downloading" && model.downloadProgress?.percent !== undefined) return `${t("model.downloading")} ${model.downloadProgress.percent}%`;
  if (busy && model.status === "not_installed") return t("model.downloading");
  if (busy) return t("model.applying");
  if (model.status === "running") return model.engine === "whisper.cpp" ? t("model.readyLocal") : t("common.running");
  if (model.status === "installed") return model.runtimeNote ?? t("model.installed");
  if (model.status === "stopped") return t("common.stopped");
  if (model.status === "not_installed") return model.downloadUrl ? t("model.notInstalled") : t("common.notConfigured");
  if (model.status === "downloading") return t("model.downloading");
  return model.error ?? t("common.needsAttention");
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes < 0) return "--";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

function RecordingHud({ recording, onOpenRecord, t }: { recording: RecordingState; onOpenRecord: () => void; t: Translator }) {
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
        <strong>{recordingTitle(recording, t)}</strong>
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
