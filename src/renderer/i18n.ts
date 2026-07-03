export type UiLanguage = "en" | "zh-CN";

export const messages = {
  en: {
    app: {
      openSource: "Open Source",
      loading: "Loading BriefInk..."
    },
    nav: {
      model: "Model",
      record: "Record",
      history: "History",
      settings: "Settings"
    },
    common: {
      cancel: "Cancel",
      save: "Save",
      copy: "Copy",
      edit: "Edit",
      delete: "Delete",
      clear: "Clear",
      close: "Close",
      refresh: "Refresh",
      selected: "Selected",
      use: "Use",
      running: "Running",
      stopped: "Stopped",
      configured: "Configured",
      notConfigured: "Not configured",
      needsAttention: "Needs attention",
      seconds: "seconds"
    },
    notices: {
      preparingModel: "Preparing model files...",
      startingModel: "Starting local model service...",
      stoppingModel: "Stopping model service...",
      updatingModel: "Updating model...",
      modelUpdated: "Model state updated.",
      modelFailed: "Model action failed.",
      micDenied: "Microphone access is not granted. Open macOS System Settings > Privacy & Security > Microphone and enable BriefInk.",
      mediaUnavailable: "This Electron window cannot access microphone recording APIs.",
      noInputDevice: "No microphone input device was found. Connect or select an input device in Settings.",
      conversionFailed: "Recording conversion or transcription failed.",
      micFailed: "Microphone permission failed.",
      noSignal: "No microphone signal detected. Check BriefInk microphone permission and selected input device."
    },
    status: {
      not_installed: "Not installed",
      downloading: "Downloading",
      installed: "Installed",
      running: "Running",
      stopped: "Stopped",
      error: "Error"
    },
    model: {
      eyebrow: "Model",
      title: "Choose the voice model",
      description: "Select the local model or configure a compatible cloud provider.",
      activeModel: "Active Model",
      recognitionLanguage: "Recognition Language",
      outputLanguage: "Output Language",
      speed: "Speed",
      accuracy: "Accuracy",
      download: "Download",
      start: "Start",
      stop: "Stop",
      configure: "Configure",
      useDefault: "Use",
      providerConfig: "Provider Configuration",
      provider: "Provider",
      baseUrl: "Base URL",
      apiKey: "API Key",
      modelName: "Model Name",
      timeout: "Timeout",
      downloading: "Downloading model file and preparing runtime...",
      applying: "Applying model state change...",
      readyLocal: "Ready for local transcription",
      installed: "Configured and ready to start",
      notInstalled: "Model file has not been downloaded"
    },
    record: {
      eyebrow: "Record",
      title: "Speak, stop, copy",
      description: "Use the global shortcut anywhere, or record from this page.",
      stop: "Stop Recording",
      start: "Start Recording",
      latestResult: "Latest Result",
      transcribing: "Transcribing audio...",
      empty: "No transcription yet.",
      original: "Original"
    },
    history: {
      eyebrow: "History",
      title: "Recent text history",
      description: "Review, edit, copy, play, and delete saved local records.",
      records: "records",
      selected: "selected",
      audioFolder: "Audio Folder",
      deleteSelected: "Delete Selected",
      empty: "No saved history. Enable text history in Settings when you want a local trail.",
      selectRecord: "Select history record",
      text: "Text",
      translatedText: "Translated Text",
      optional: "Optional",
      audioUnavailable: "Audio playback is not available in this browser.",
      confirmClear: "Clear all history records and their saved audio files?",
      confirmDelete: "Delete this history record and its saved audio file?",
      confirmDeleteSelected: "Delete {count} selected history records and their saved audio files?"
    },
    settings: {
      eyebrow: "Settings",
      title: "Control the workflow",
      description: "Configure shortcuts, recording, output, privacy, API, and app preferences.",
      hotkey: "Hotkey",
      startStopRecording: "Start / Stop Recording",
      pressCombination: "Press a key combination...",
      confirm: "Confirm",
      recording: "Recording",
      inputDevice: "Input Device",
      maxDuration: "Max Duration",
      microphone: "Microphone",
      output: "Output",
      copyClipboard: "Copy to clipboard",
      pasteFrontmost: "Paste into frontmost app",
      showNotification: "Show notification",
      accessibility: "Accessibility",
      accessibilityNeeded: "needed for auto paste",
      history: "History",
      saveTextHistory: "Save text history",
      saveAudioFiles: "Save audio files",
      localApi: "Local API",
      enableApi: "Enable API server",
      endpoint: "Endpoint",
      apiKey: "API Key",
      diagnostics: "Diagnostics",
      language: "Language",
      systemDefault: "System Default",
      microphoneDevice: "Microphone {index}",
      english: "English",
      simplifiedChinese: "中文简体",
      version: "Version",
      openLogs: "Open logs folder",
      logsHint: "Logs are written to the app data directory and rotate at 2 MB.",
      granted: "granted"
    },
    languages: {
      auto: "Auto Detect",
      same: "Same as spoken language",
      zh: "Chinese",
      en: "English",
      ja: "Japanese",
      ko: "Korean",
      es: "Spanish",
      fr: "French",
      de: "German"
    },
    recording: {
      recording: "Recording...",
      transcribing: "Transcribing...",
      completed: "Copied to clipboard",
      error: "Something went wrong",
      ready: "Ready",
      stopHint: "Press the shortcut again to stop",
      pastedHint: "Text is ready in the current app",
      attention: "BriefInk needs attention"
    }
  },
  "zh-CN": {
    app: {
      openSource: "开源版",
      loading: "正在加载 BriefInk..."
    },
    nav: {
      model: "模型",
      record: "录音",
      history: "历史",
      settings: "设置"
    },
    common: {
      cancel: "取消",
      save: "保存",
      copy: "复制",
      edit: "编辑",
      delete: "删除",
      clear: "清空",
      close: "关闭",
      refresh: "刷新",
      selected: "已选择",
      use: "使用",
      running: "运行中",
      stopped: "已停止",
      configured: "已配置",
      notConfigured: "未配置",
      needsAttention: "需要处理",
      seconds: "秒"
    },
    notices: {
      preparingModel: "正在准备模型文件...",
      startingModel: "正在启动本地模型服务...",
      stoppingModel: "正在停止模型服务...",
      updatingModel: "正在更新模型...",
      modelUpdated: "模型状态已更新。",
      modelFailed: "模型操作失败。",
      micDenied: "未授予麦克风权限。请打开 macOS 系统设置 > 隐私与安全性 > 麦克风，并启用 BriefInk。",
      mediaUnavailable: "当前 Electron 窗口无法访问麦克风录音 API。",
      noInputDevice: "没有检测到麦克风输入设备。请连接或在设置中选择输入设备。",
      conversionFailed: "录音转换或转写失败。",
      micFailed: "麦克风权限请求失败。",
      noSignal: "没有检测到麦克风声音。请检查 BriefInk 麦克风权限和输入设备。"
    },
    status: {
      not_installed: "未安装",
      downloading: "下载中",
      installed: "已安装",
      running: "运行中",
      stopped: "已停止",
      error: "错误"
    },
    model: {
      eyebrow: "模型",
      title: "选择语音模型",
      description: "选择本地模型，或配置兼容的云端转写服务。",
      activeModel: "当前模型",
      recognitionLanguage: "识别语言",
      outputLanguage: "输出语言",
      speed: "速度",
      accuracy: "准确率",
      download: "下载",
      start: "启动",
      stop: "停止",
      configure: "配置",
      useDefault: "使用",
      providerConfig: "服务配置",
      provider: "服务商",
      baseUrl: "Base URL",
      apiKey: "API Key",
      modelName: "模型名称",
      timeout: "超时时间",
      downloading: "正在下载模型文件并准备运行时...",
      applying: "正在应用模型状态...",
      readyLocal: "本地转写已就绪",
      installed: "已配置，可启动",
      notInstalled: "模型文件尚未下载"
    },
    record: {
      eyebrow: "录音",
      title: "说话，停止，得到文字",
      description: "可以在任意 App 使用全局快捷键，也可以在本页录音。",
      stop: "停止录音",
      start: "开始录音",
      latestResult: "最近结果",
      transcribing: "正在转写音频...",
      empty: "暂无转写结果。",
      original: "原文"
    },
    history: {
      eyebrow: "历史",
      title: "最近文字记录",
      description: "查看、编辑、复制、播放和删除本地保存的记录。",
      records: "条记录",
      selected: "已选",
      audioFolder: "音频目录",
      deleteSelected: "删除所选",
      empty: "暂无历史记录。需要本地记录时，请在设置中开启文本历史。",
      selectRecord: "选择历史记录",
      text: "文本",
      translatedText: "翻译文本",
      optional: "可选",
      audioUnavailable: "当前环境无法播放音频。",
      confirmClear: "确认清空所有历史记录和保存的音频文件？",
      confirmDelete: "确认删除这条历史记录和对应音频文件？",
      confirmDeleteSelected: "确认删除选中的 {count} 条历史记录和对应音频文件？"
    },
    settings: {
      eyebrow: "设置",
      title: "控制工作流",
      description: "配置快捷键、录音、输出、隐私、本地 API 和应用偏好。",
      hotkey: "快捷键",
      startStopRecording: "开始 / 停止录音",
      pressCombination: "请按下组合键...",
      confirm: "确认",
      recording: "录音",
      inputDevice: "输入设备",
      maxDuration: "最大时长",
      microphone: "麦克风",
      output: "输出",
      copyClipboard: "复制到剪贴板",
      pasteFrontmost: "粘贴到当前输入框",
      showNotification: "显示通知",
      accessibility: "辅助功能",
      accessibilityNeeded: "自动粘贴需要授权",
      history: "历史",
      saveTextHistory: "保存文本历史",
      saveAudioFiles: "保存音频文件",
      localApi: "本地 API",
      enableApi: "启用 API 服务",
      endpoint: "Endpoint",
      apiKey: "API Key",
      diagnostics: "诊断",
      language: "界面语言",
      systemDefault: "系统默认",
      microphoneDevice: "麦克风 {index}",
      english: "English",
      simplifiedChinese: "中文简体",
      version: "版本",
      openLogs: "打开日志目录",
      logsHint: "日志写入应用数据目录，超过 2 MB 会轮转。",
      granted: "已授权"
    },
    languages: {
      auto: "自动检测",
      same: "与说话语言一致",
      zh: "中文",
      en: "英文",
      ja: "日文",
      ko: "韩文",
      es: "西班牙文",
      fr: "法文",
      de: "德文"
    },
    recording: {
      recording: "正在录音...",
      transcribing: "正在转写...",
      completed: "已复制到剪贴板",
      error: "出现问题",
      ready: "就绪",
      stopHint: "再次按快捷键停止录音",
      pastedHint: "文字已准备好并粘贴到当前 App",
      attention: "BriefInk 需要处理"
    }
  }
} as const;

type MessageTree = typeof messages.en;
type DotPrefix<TPrefix extends string, TKey extends string> = `${TPrefix}.${TKey}`;
type DotPaths<T> = {
  [K in keyof T & string]: T[K] extends string ? K : DotPrefix<K, DotPaths<T[K]>>
}[keyof T & string];

export type MessageKey = DotPaths<MessageTree>;

export function createTranslator(language: UiLanguage | undefined) {
  const dictionary = messages[language ?? "en"] ?? messages.en;
  return (key: MessageKey, replacements?: Record<string, string | number>) => {
    const fallback = resolve(messages.en, key);
    const value = resolve(dictionary, key) ?? fallback ?? key;
    if (!replacements) return value;
    return Object.entries(replacements).reduce(
      (text, [name, replacement]) => text.replaceAll(`{${name}}`, String(replacement)),
      value
    );
  };
}

function resolve(dictionary: unknown, path: string): string | undefined {
  const value = path.split(".").reduce<unknown>((current, part) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[part];
  }, dictionary);
  return typeof value === "string" ? value : undefined;
}
