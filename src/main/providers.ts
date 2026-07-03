import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { ModelManager } from "./modelManager.js";
import { logger } from "./logger.js";
import { transcribeWithWhisperCpp } from "./whisperRuntime.js";
import type { CloudProviderConfig, TranscriptionOptions, TranscriptionResult } from "../shared/types.js";

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly statusCode = 500
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export interface TranscriptionProvider {
  transcribe(audioFile: string, options: TranscriptionOptions): Promise<TranscriptionResult>;
}

export function createTranscriptionProvider(models: ModelManager): TranscriptionProvider {
  return new RoutingTranscriptionProvider(models);
}

export class MockTranscriptionProvider implements TranscriptionProvider {
  constructor(private readonly models: ModelManager) {}

  async transcribe(audioFile: string, options: TranscriptionOptions): Promise<TranscriptionResult> {
    const model = options.modelId && options.modelId !== "default" ? this.models.get(options.modelId) : this.models.getDefault();
    if (!model) throw new ProviderError("No transcription model is available.", 404);
    if (model.kind === "local" && !["running", "installed"].includes(model.status)) {
      throw new ProviderError(`${model.name} is not running.`, 409);
    }

    const source = options.language === "auto" ? "auto-detected" : options.language;
    const text = `BriefInk mock transcript from ${basename(audioFile)} using ${model.name} (${source}).`;
    const shouldTranslate = options.outputLanguage !== "same" && options.outputLanguage !== options.language;

    logger.debug("Using mock transcription provider", {
      audioFile,
      modelId: model.id,
      language: options.language,
      outputLanguage: options.outputLanguage
    });

    return {
      text,
      translatedText: shouldTranslate && model.supportsTranslation ? `[${options.outputLanguage}] ${text}` : undefined,
      language: options.language,
      targetLanguage: options.outputLanguage,
      duration: 3.2,
      modelId: model.id,
      model: model.id,
      providerId: model.kind
    };
  }
}

export class RoutingTranscriptionProvider implements TranscriptionProvider {
  constructor(private readonly models: ModelManager) {}

  async transcribe(audioFile: string, options: TranscriptionOptions): Promise<TranscriptionResult> {
    const model = options.modelId && options.modelId !== "default" ? this.models.get(options.modelId) : this.models.getDefault();

    if (!model) {
      throw new ProviderError(`Unknown transcription model: ${options.modelId ?? "default"}`, 404);
    }

    if ((model.kind === "cloud" || model.kind === "custom") && model.config?.apiKey && (model.config.baseUrl || model.config.endpoint)) {
      logger.info("Routing transcription to OpenAI-compatible provider", {
        modelId: model.id,
        kind: model.kind,
        baseUrl: model.config.baseUrl ?? model.config.endpoint
      });
      return new OpenAICompatibleTranscriptionProvider(model.config, model.id, model.kind).transcribe(audioFile, options);
    }

    if (model.kind === "local" && model.engine === "whisper.cpp") {
      logger.info("Routing transcription to whisper.cpp", { modelId: model.id, localPath: model.localPath });
      return transcribeWithWhisperCpp(model, audioFile, options);
    }

    if (model.kind === "local") {
      throw new ProviderError(model.error ?? model.runtimeNote ?? `${model.name} runtime is not implemented yet.`, 501);
    }

    throw new ProviderError(`${model.name} is not configured.`, 400);
  }
}

export class OpenAICompatibleTranscriptionProvider implements TranscriptionProvider {
  constructor(
    private readonly config: CloudProviderConfig,
    private readonly fallbackModelId: string,
    private readonly providerId: string
  ) {}

  async transcribe(audioFile: string, options: TranscriptionOptions): Promise<TranscriptionResult> {
    const shouldTranslate = options.outputLanguage !== "same" && options.outputLanguage !== options.language;
    const endpoint = shouldTranslate ? "translations" : "transcriptions";
    const text = await this.postAudio(endpoint, audioFile, options);
    const parsed = parseJsonObject(text);
    const outputText = asString(parsed.text) ?? text;

    return {
      text: shouldTranslate ? `Source transcript unavailable from ${this.providerId}.` : outputText,
      translatedText: shouldTranslate ? outputText : undefined,
      language: asString(parsed.language) ?? options.language,
      targetLanguage: shouldTranslate ? options.outputLanguage : options.language,
      duration: asNumber(parsed.duration),
      modelId: options.modelId ?? this.fallbackModelId,
      model: asString(parsed.model) ?? options.modelId ?? this.fallbackModelId,
      providerId: this.providerId,
      task: shouldTranslate ? "translation" : "transcription",
      segments: Array.isArray(parsed.segments) ? parsed.segments as TranscriptionResult["segments"] : undefined
    };
  }

  private async postAudio(endpoint: "transcriptions" | "translations", audioFile: string, options: TranscriptionOptions): Promise<string> {
    const form = new FormData();
    const data = await readFile(audioFile);
    form.append("file", new Blob([data], { type: "application/octet-stream" }), basename(audioFile));
    form.append("model", this.config.model ?? this.config.modelName ?? options.modelId ?? this.fallbackModelId);

    if (options.language && options.language !== "auto" && endpoint === "transcriptions") {
      form.append("language", options.language);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 120_000);

    try {
      logger.info("Calling OpenAI-compatible audio endpoint", { endpoint, baseUrl: this.baseUrl() });
      const response = await fetch(`${this.baseUrl()}/v1/audio/${endpoint}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          ...(this.config.organization ? { "OpenAI-Organization": this.config.organization } : {})
        },
        body: form,
        signal: controller.signal
      });
      const text = await response.text();

      if (!response.ok) {
        logger.warn("OpenAI-compatible provider returned error", { status: response.status, body: text });
        throw new ProviderError(`Provider returned ${response.status}: ${text}`, response.status);
      }

      logger.info("OpenAI-compatible provider completed", { endpoint, status: response.status });
      return text;
    } finally {
      clearTimeout(timeout);
    }
  }

  private baseUrl(): string {
    return (this.config.baseUrl ?? this.config.endpoint ?? "https://api.openai.com").replace(/\/+$/, "");
  }
}

function parseJsonObject(text: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}
