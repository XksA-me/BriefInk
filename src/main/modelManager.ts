import type { CloudProviderConfig, ModelStatus, SpeechModel } from "../shared/types.js";
import { logger } from "./logger.js";
import { downloadFile, getWhisperRuntimePath, hasWhisperCppRuntime } from "./whisperRuntime.js";
import { join } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const initialModels: SpeechModel[] = [
  {
    id: "whisper-large-v3-turbo-quantized",
    name: "Whisper Large v3 Turbo Quantized",
    kind: "local",
    languageCapability: "multilingual",
    sizeLabel: "547 MB",
    speedScore: 8.1,
    accuracyScore: 9.5,
    status: "not_installed",
    default: true,
    supportsTranslation: true,
    managedByBriefInk: false,
    engine: "whisper.cpp",
    downloadUrl: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin",
    expectedBytes: 574041195,
    expectedSha256: "394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2",
    runtimeNote: "Runs with BriefInk's bundled whisper.cpp runtime. This is the VoiceInk-style Large v3 Turbo q5_0 model."
  },
  {
    id: "custom-openai-compatible",
    name: "Custom OpenAI-compatible",
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

export class ModelManager {
  private models = clone(initialModels);

  constructor(
    private readonly modelDirectory = join(process.cwd(), ".briefink-models"),
    private readonly statePath?: string
  ) {
    this.models = this.models.map((model) => this.withLocalPath(model));
    this.applyPersistedState();
    this.models = this.models.map((model) =>
      model.localPath && existsSync(model.localPath) ? { ...model, status: model.status === "not_installed" ? "installed" : model.status } : model
    );
  }

  list(): SpeechModel[] {
    return clone(this.models);
  }

  get(modelId: string): SpeechModel | undefined {
    const model = this.models.find((candidate) => candidate.id === modelId);
    return model ? clone(model) : undefined;
  }

  getDefault(): SpeechModel {
    return clone(this.models.find((model) => model.default) ?? this.models[0]);
  }

  async download(modelId: string): Promise<SpeechModel[]> {
    logger.info("Model download requested", { modelId });
    const model = this.require(modelId);
    if (model.engine !== "whisper.cpp" || !model.downloadUrl || !model.localPath) {
      this.setStatus(modelId, "error", { error: model.runtimeNote ?? "This model runtime is not implemented yet." });
      return this.list();
    }
    this.setStatus(modelId, "downloading");
    await downloadFile(model.downloadUrl, model.localPath, model.expectedBytes, model.expectedSha256);
    this.setStatus(modelId, "installed", { managedByBriefInk: false, error: undefined });
    logger.info("Model download completed", { modelId });
    return this.list();
  }

  async start(modelId: string): Promise<SpeechModel[]> {
    const model = this.require(modelId);
    logger.info("Model start requested", { modelId, kind: model.kind, status: model.status });
    if (model.engine === "mlx") {
      this.setStatus(modelId, "error", { error: model.runtimeNote ?? "This runtime is not implemented yet." });
      return this.list();
    }
    if (model.kind === "local" && model.status === "not_installed") {
      return this.download(modelId);
    }
    if (model.engine === "whisper.cpp" && model.localPath && !existsSync(model.localPath)) {
      this.setStatus(modelId, "error", { error: "Model file is missing. Download it first." });
      return this.list();
    }
    if (model.engine === "whisper.cpp" && !(await hasWhisperCppRuntime())) {
      this.setStatus(modelId, "error", { error: "BriefInk could not find its bundled transcription runtime. Reinstall BriefInk or download a fresh build." });
      return this.list();
    }
    const runtimePath = await getWhisperRuntimePath();
    if (!runtimePath?.includes("whisper-cli")) {
      this.setStatus(modelId, "error", { error: "BriefInk found an old transcription runtime. Reinstall BriefInk or download a fresh build." });
      return this.list();
    }
    this.setStatus(modelId, "running", { managedByBriefInk: model.kind === "local", error: undefined });
    return this.list();
  }

  async stop(modelId: string): Promise<SpeechModel[]> {
    logger.info("Model stop requested", { modelId });
    this.setStatus(modelId, "stopped", { managedByBriefInk: false });
    return this.list();
  }

  async stopManagedModels(): Promise<void> {
    logger.info("Stopping BriefInk-managed models");
    this.models = this.models.map((model) =>
      model.managedByBriefInk ? { ...model, status: "stopped", managedByBriefInk: false } : model
    );
    this.persistState();
  }

  setDefault(modelId: string): SpeechModel[] {
    this.require(modelId);
    logger.info("Default model changed", { modelId });
    this.models = this.models.map((model) => ({ ...model, default: model.id === modelId }));
    this.persistState();
    return this.list();
  }

  configure(modelId: string, config: CloudProviderConfig): SpeechModel[] {
    this.require(modelId);
    logger.info("Model configured", {
      modelId,
      provider: config.provider,
      baseUrl: config.baseUrl ?? config.endpoint,
      hasApiKey: Boolean(config.apiKey),
      modelName: config.modelName ?? config.model
    });
    this.models = this.models.map((model) =>
      model.id === modelId ? { ...model, config, status: "installed", error: undefined } : model
    );
    this.persistState();
    return this.list();
  }

  private require(modelId: string): SpeechModel {
    const model = this.models.find((candidate) => candidate.id === modelId);
    if (!model) throw new Error(`Unknown model: ${modelId}`);
    return model;
  }

  private setStatus(modelId: string, status: ModelStatus, patch: Partial<SpeechModel> = {}): void {
    this.require(modelId);
    this.models = this.models.map((model) => (model.id === modelId ? { ...model, status, ...patch } : model));
    this.persistState();
  }

  private withLocalPath(model: SpeechModel): SpeechModel {
    if (!model.downloadUrl || model.kind !== "local") return model;
    const fileName = model.downloadUrl.split("/").pop() ?? `${model.id}.bin`;
    return { ...model, localPath: join(this.modelDirectory, fileName) };
  }

  private applyPersistedState(): void {
    if (!this.statePath || !existsSync(this.statePath)) return;
    try {
      const state = parseModelState(JSON.parse(readFileSync(this.statePath, "utf8")));
      const defaultModelId = normalizePersistedDefault(state.defaultModelId);
      this.models = this.models.map((model) => {
        const persisted = state.models[model.id];
        const defaultPatch = defaultModelId ? { default: model.id === defaultModelId } : {};
        if (!persisted) return { ...model, ...defaultPatch };
        const status = persisted.status === "running" ? "stopped" : persisted.status;
        return {
          ...model,
          ...defaultPatch,
          config: persisted.config ?? model.config,
          status: status ?? model.status,
          managedByBriefInk: false,
          error: persisted.error
        };
      });
    } catch (error) {
      logger.warn("Could not load model state; using defaults", error);
    }
  }

  private persistState(): void {
    if (!this.statePath) return;
    const state: PersistedModelState = {
      defaultModelId: this.getDefault().id,
      models: Object.fromEntries(
        this.models.map((model) => [
          model.id,
          {
            status: model.status,
            config: model.config,
            error: model.error
          }
        ])
      )
    };
    mkdirSync(dirname(this.statePath), { recursive: true });
    writeFileSync(this.statePath, JSON.stringify(state, null, 2), "utf8");
  }
}

type PersistedModelState = {
  defaultModelId?: string;
  models: Record<string, { status?: ModelStatus; config?: CloudProviderConfig; error?: string }>;
};

function parseModelState(value: unknown): PersistedModelState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { models: {} };
  const record = value as Record<string, unknown>;
  return {
    defaultModelId: typeof record.defaultModelId === "string" ? record.defaultModelId : undefined,
    models: record.models && typeof record.models === "object" && !Array.isArray(record.models)
      ? record.models as PersistedModelState["models"]
      : {}
  };
}

function normalizePersistedDefault(modelId: string | undefined): string | undefined {
  if (!modelId) return undefined;
  if (modelId === "custom-openai-compatible") return modelId;
  return "whisper-large-v3-turbo-quantized";
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
