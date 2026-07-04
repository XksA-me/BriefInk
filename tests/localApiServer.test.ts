import { createServer } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { LocalApiServer } from "../src/main/localApiServer.js";
import { ModelManager } from "../src/main/modelManager.js";
import { MockTranscriptionProvider } from "../src/main/providers.js";
import { defaultSettings } from "../src/main/settingsStore.js";
import type { AppSettings } from "../src/shared/types.js";

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Could not allocate a local test port."));
        return;
      }
      server.close(() => resolve(address.port));
    });
  });
}

describe("LocalApiServer", () => {
  const servers: LocalApiServer[] = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.stop()));
  });

  async function startServer() {
    const settings: AppSettings = {
      ...defaultSettings(),
      localApi: {
        ...defaultSettings().localApi,
        enabled: true,
        port: await getFreePort(),
        apiKey: "briefink_test_key"
      }
    };
    const models = new ModelManager();
    models.configure("custom-openai-compatible", { endpoint: "https://api.example.test", model: "custom" });
    models.setDefault("custom-openai-compatible");
    const server = new LocalApiServer(() => settings, models, new MockTranscriptionProvider(models));
    await server.start();
    servers.push(server);
    return { server, settings };
  }

  it("requires Bearer token auth before exposing OpenAI-compatible routes", async () => {
    const { settings } = await startServer();
    const url = `http://${settings.localApi.host}:${settings.localApi.port}/v1/models`;

    const missingAuth = await fetch(url);
    expect(missingAuth.status).toBe(401);
    await expect(missingAuth.json()).resolves.toEqual({ error: "Unauthorized" });

    const wrongAuth = await fetch(url, { headers: { authorization: "Bearer wrong" } });
    expect(wrongAuth.status).toBe(401);

    const authed = await fetch(url, { headers: { authorization: `Bearer ${settings.localApi.apiKey}` } });
    expect(authed.status).toBe(200);
    await expect(authed.json()).resolves.toEqual({
      object: "list",
      data: expect.arrayContaining([
        expect.objectContaining({
          id: "custom-openai-compatible",
          object: "model",
          owned_by: "custom"
        })
      ])
    });
  });

  it("accepts multipart transcription requests and returns OpenAI-compatible JSON", async () => {
    const { settings } = await startServer();
    const form = new FormData();
    form.set("file", new Blob(["test audio"], { type: "audio/webm" }), "clip.webm");
    form.set("model", "default");
    form.set("language", "en");

    const response = await fetch(`http://${settings.localApi.host}:${settings.localApi.port}/v1/audio/transcriptions`, {
      method: "POST",
      headers: { authorization: `Bearer ${settings.localApi.apiKey}` },
      body: form
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      text: expect.stringContaining("using Third-party Speech API (en)"),
      language: "en",
      duration: 3.2,
      model: "custom-openai-compatible"
    });
  });

  it("falls back to source text for translation responses when a provider has no translated text", async () => {
    const settings: AppSettings = {
      ...defaultSettings(),
      localApi: {
        ...defaultSettings().localApi,
        enabled: true,
        port: await getFreePort(),
        apiKey: "briefink_test_key"
      }
    };
    const models = new ModelManager();
    models.configure("custom-openai-compatible", { endpoint: "https://api.example.test", model: "custom" });
    const server = new LocalApiServer(() => settings, models, new MockTranscriptionProvider(models));
    await server.start();
    servers.push(server);

    const form = new FormData();
    form.set("file", new Blob(["test audio"], { type: "audio/webm" }), "clip.webm");
    form.set("model", "custom-openai-compatible");
    form.set("source_language", "en");
    form.set("target_language", "zh");

    const response = await fetch(`http://${settings.localApi.host}:${settings.localApi.port}/v1/audio/translations`, {
      method: "POST",
      headers: { authorization: `Bearer ${settings.localApi.apiKey}` },
      body: form
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      text: expect.stringContaining("using Third-party Speech API (en)"),
      source_text: expect.stringContaining("using Third-party Speech API (en)"),
      source_language: "en",
      target_language: "zh",
      model: "custom-openai-compatible"
    });
    expect(body.text).toBe(body.source_text);
  });
});
