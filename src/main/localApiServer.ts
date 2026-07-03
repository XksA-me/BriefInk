import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWriteStream } from "node:fs";
import Busboy from "busboy";
import type { ModelManager } from "./modelManager.js";
import { createTranscriptionProvider, ProviderError, type TranscriptionProvider } from "./providers.js";
import { logger } from "./logger.js";
import type { AppSettings, LanguageCode, LocalApiServerConfig } from "../shared/types.js";

export class LocalApiServer {
  private server?: Server;
  private readonly getSettings?: () => AppSettings;
  private readonly models: ModelManager;
  private readonly provider: TranscriptionProvider;
  private readonly config?: LocalApiServerConfig;

  constructor(models: ModelManager, config: LocalApiServerConfig, provider?: TranscriptionProvider);
  constructor(getSettings: () => AppSettings, models: ModelManager, provider?: TranscriptionProvider);
  constructor(
    first: ModelManager | (() => AppSettings),
    second: LocalApiServerConfig | ModelManager,
    provider?: TranscriptionProvider
  ) {
    if (typeof first === "function") {
      this.getSettings = first;
      this.models = second as ModelManager;
      this.provider = provider ?? createTranscriptionProvider(this.models);
    } else {
      this.models = first;
      this.config = second as LocalApiServerConfig;
      this.provider = provider ?? createTranscriptionProvider(this.models);
    }
  }

  get running(): boolean {
    return Boolean(this.server?.listening);
  }

  async start(): Promise<string> {
    if (this.running) return this.url();
    const config = this.effectiveConfig();
    logger.info("Local API server starting", { host: config.host, port: config.port });
    this.server = createServer((request, response) => {
      void this.handle(request, response).catch((error) => this.sendError(response, error));
    });
    await new Promise<void>((resolve, reject) => {
      this.server?.once("error", reject);
      this.server?.listen(config.port, config.host, resolve);
    });
    logger.info("Local API server started", { url: this.url() });
    return this.url();
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    logger.info("Local API server stopping");
    await new Promise<void>((resolve) => this.server?.close(() => resolve()));
    this.server = undefined;
    logger.info("Local API server stopped");
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? "/", this.url());
    logger.debug("Local API request", { method: request.method, path: url.pathname });
    if (!this.authorized(request.headers.authorization)) {
      logger.warn("Local API unauthorized request", { method: request.method, path: url.pathname });
      sendJson(response, 401, { error: "Unauthorized" });
      return;
    }

    if (request.method === "GET" && url.pathname === "/v1/models") {
      sendJson(response, 200, {
        object: "list",
        data: this.models.list().map((model) => ({
          id: model.id,
          object: "model",
          created: 1720000000,
          owned_by: model.kind
        }))
      });
      return;
    }

    if (request.method === "POST" && ["/v1/audio/transcriptions", "/v1/audio/translations"].includes(url.pathname)) {
      const form = await this.parseMultipart(request);
      const isTranslation = url.pathname.endsWith("/translations");
      logger.info("Local API audio request", {
        task: isTranslation ? "translation" : "transcription",
        model: form.fields.model ?? "default",
        language: form.fields.language ?? form.fields.source_language ?? "auto"
      });
      const result = await this.provider.transcribe(form.filePath, {
        modelId: form.fields.model === "default" ? undefined : form.fields.model,
        language: (form.fields.language ?? form.fields.source_language ?? "auto") as LanguageCode,
        outputLanguage: (isTranslation ? form.fields.target_language ?? "en" : "same") as LanguageCode
      });

      if (isTranslation) {
        sendJson(response, 200, {
          text: result.translatedText ?? result.text,
          source_text: result.text,
          source_language: result.language,
          target_language: result.targetLanguage,
          model: result.modelId
        });
      } else {
        sendJson(response, 200, {
          text: result.text,
          language: result.language,
          duration: result.duration,
          model: result.modelId
        });
      }
      return;
    }

    sendJson(response, 404, { error: "Not found" });
  }

  private authorized(header?: string): boolean {
    return header === `Bearer ${this.effectiveConfig().bearerToken}`;
  }

  private parseMultipart(request: IncomingMessage): Promise<{ filePath: string; fields: Record<string, string> }> {
    return new Promise((resolve, reject) => {
      const busboy = Busboy({ headers: request.headers });
      const fields: Record<string, string> = {};
      let filePath = join(tmpdir(), `briefink-${Date.now()}.audio`);

      busboy.on("field", (name, value) => {
        fields[name] = value;
      });
      busboy.on("file", (_name, file, info) => {
        filePath = join(tmpdir(), `briefink-${Date.now()}-${info.filename || "upload.audio"}`);
        file.pipe(createWriteStream(filePath));
      });
      busboy.on("error", reject);
      busboy.on("finish", () => resolve({ filePath, fields }));
      request.pipe(busboy);
    });
  }

  private sendError(response: ServerResponse, error: unknown): void {
    logger.error("Local API request failed", error);
    if (error instanceof ProviderError) {
      sendJson(response, error.statusCode, { error: error.message });
      return;
    }
    sendJson(response, 500, { error: error instanceof Error ? error.message : "Internal error" });
  }

  private url(): string {
    const config = this.effectiveConfig();
    return `http://${config.host}:${config.port}`;
  }

  private effectiveConfig(): LocalApiServerConfig {
    if (this.getSettings) {
      const { localApi } = this.getSettings();
      return {
        enabled: localApi.enabled,
        host: localApi.host,
        port: localApi.port,
        bearerToken: localApi.apiKey,
        defaultModelId: this.models.getDefault().id
      };
    }

    return (
      this.config ?? {
        enabled: true,
        host: "127.0.0.1",
        port: 8765,
        bearerToken: "briefink-local-dev-key",
        defaultModelId: this.models.getDefault().id
      }
    );
  }
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}
