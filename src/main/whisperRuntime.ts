import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, existsSync, createWriteStream, renameSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import { readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";
import { logger } from "./logger.js";
import type { SpeechModel, TranscriptionOptions, TranscriptionResult } from "../shared/types.js";

const execFileAsync = promisify(execFile);
const electronResourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
const platformRuntime = process.platform === "darwin" && process.arch === "arm64" ? "darwin-arm64" : `${process.platform}-${process.arch}`;

const binaryCandidates = [
  join(electronResourcesPath ?? process.cwd(), "runtimes", "whisper", platformRuntime, "bin", "whisper-cli"),
  join(electronResourcesPath ?? process.cwd(), "runtimes", "whisper", platformRuntime, "whisper-cli"),
  join(electronResourcesPath ?? process.cwd(), "runtimes", "whisper", platformRuntime, "main"),
  join(process.cwd(), "resources", "runtimes", "whisper", platformRuntime, "bin", "whisper-cli"),
  join(process.cwd(), "resources", "runtimes", "whisper", platformRuntime, "whisper-cli"),
  join(process.cwd(), "resources", "runtimes", "whisper", platformRuntime, "main"),
  "/opt/homebrew/bin/whisper-cli",
  "/usr/local/bin/whisper-cli",
  "/opt/homebrew/bin/whisper-cpp",
  "/usr/local/bin/whisper-cpp",
  "whisper-cli",
  "whisper-cpp"
];

type DownloadProgressHandler = (progress: { receivedBytes: number; totalBytes?: number; percent?: number }) => void;

export async function downloadFile(
  url: string,
  destination: string,
  expectedBytes?: number,
  expectedSha256?: string,
  onProgress?: DownloadProgressHandler
): Promise<void> {
  mkdirSync(dirname(destination), { recursive: true });
  if (existsSync(destination)) {
    if (
      (!expectedBytes || statSync(destination).size === expectedBytes) &&
      (!expectedSha256 || await sha256File(destination) === expectedSha256)
    ) {
      return;
    }
    logger.warn("Existing download has unexpected size; replacing", {
      destination,
      actualBytes: statSync(destination).size,
      expectedBytes,
      expectedSha256
    });
    rmSync(destination, { force: true });
  }

  logger.info("Downloading model file", { url, destination });
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Download failed ${response.status}: ${url}`);
  }
  const body = response.body;
  const contentLength = Number(response.headers.get("content-length"));
  const totalBytes = expectedBytes || (Number.isFinite(contentLength) && contentLength > 0 ? contentLength : undefined);
  const temporaryDestination = `${destination}.download`;
  rmSync(temporaryDestination, { force: true });

  await new Promise<void>((resolve, reject) => {
    const file = createWriteStream(temporaryDestination);
    let receivedBytes = 0;
    body.pipeTo(
      new WritableStream({
        write(chunk) {
          const buffer = Buffer.from(chunk);
          receivedBytes += buffer.byteLength;
          onProgress?.({
            receivedBytes,
            totalBytes,
            percent: totalBytes ? Math.min(100, Math.round((receivedBytes / totalBytes) * 100)) : undefined
          });
          file.write(buffer);
        },
        close() {
          file.end(resolve);
        },
        abort(reason) {
          file.destroy();
          reject(reason);
        }
      })
    ).catch(reject);
  });
  if (expectedBytes && statSync(temporaryDestination).size !== expectedBytes) {
    const actualBytes = statSync(temporaryDestination).size;
    rmSync(temporaryDestination, { force: true });
    throw new Error(`Downloaded file size mismatch for ${url}: expected ${expectedBytes}, got ${actualBytes}`);
  }
  if (expectedSha256) {
    const actualSha256 = await sha256File(temporaryDestination);
    if (actualSha256 !== expectedSha256) {
      rmSync(temporaryDestination, { force: true });
      throw new Error(`Downloaded file checksum mismatch for ${url}: expected ${expectedSha256}, got ${actualSha256}`);
    }
  }
  renameSync(temporaryDestination, destination);
  logger.info("Model file downloaded", { destination });
}

export async function transcribeWithWhisperCpp(
  model: SpeechModel,
  audioFile: string,
  options: TranscriptionOptions
): Promise<TranscriptionResult> {
  if (!model.localPath || !existsSync(model.localPath)) {
    throw new Error(`${model.name} model file is missing. Download it first.`);
  }

  const binary = await findWhisperBinary();
  if (!binary) {
    throw new Error("BriefInk bundled transcription runtime is missing or damaged. Reinstall BriefInk or rebuild with npm run prepare:whisper-runtime.");
  }

  const outputPrefix = join("/tmp", `briefink-whisper-${Date.now()}-${basename(audioFile).replace(/\W+/g, "-")}`);
  const args = [
    "-m", model.localPath,
    "-f", audioFile,
    "-otxt",
    "-of", outputPrefix,
    "-nt",
    "-t", String(recommendedWhisperThreads()),
    "-bs", "1",
    "-bo", "1"
  ];
  if (shouldDisableGpuForWhisper()) args.push("-ng");
  if (options.language) args.push("-l", whisperLanguage(options.language));
  if (options.outputLanguage === "en" && options.language !== "en") args.push("-tr");

  logger.info("Running whisper.cpp", { binary, args });
  const startedAt = Date.now();
  const { stdout, stderr } = await execFileAsync(binary, args, {
    timeout: 10 * 60_000,
    maxBuffer: 1024 * 1024 * 16,
    env: {
      ...process.env,
      DYLD_LIBRARY_PATH: runtimeLibraryPath(binary, process.env.DYLD_LIBRARY_PATH)
    }
  });
  if (stderr.trim()) logger.debug("whisper.cpp stderr", stderr.trim());

  let text = stdout.trim();
  const outputTextPath = `${outputPrefix}.txt`;
  if (existsSync(outputTextPath)) {
    text = (await readFile(outputTextPath, "utf8")).trim();
  }

  if (!text) throw new Error("whisper.cpp returned empty transcription.");
  const translated = options.outputLanguage !== "same" && options.outputLanguage === "en" ? text : undefined;

  return {
    text: translated ? `Source transcript unavailable from whisper.cpp translation mode.` : text,
    translatedText: translated,
    language: options.language,
    targetLanguage: options.outputLanguage,
    duration: Math.round((Date.now() - startedAt) / 100) / 10,
    modelId: model.id,
    model: model.id,
    providerId: "whisper.cpp"
  };
}

function recommendedWhisperThreads(): number {
  const cpuCount = os.cpus().length || 4;
  if (process.platform === "darwin" && process.arch === "x64") return Math.max(4, Math.min(8, cpuCount - 1));
  return Math.max(4, Math.min(cpuCount, 8));
}

function shouldDisableGpuForWhisper(): boolean {
  if (process.env.BRIEFINK_WHISPER_GPU === "1") return false;
  if (process.env.BRIEFINK_WHISPER_GPU === "0") return true;
  return process.platform === "darwin" && process.arch === "x64";
}

export async function hasWhisperCppRuntime(): Promise<boolean> {
  return Boolean(await findWhisperBinary());
}

export async function getWhisperRuntimePath(): Promise<string | null> {
  return findWhisperBinary();
}

async function findWhisperBinary(): Promise<string | null> {
  for (const candidate of binaryCandidates) {
    if (candidate.includes("/") && existsSync(candidate)) return candidate;
    try {
      if (candidate.includes("/")) continue;
      const { stdout } = await execFileAsync("which", [candidate]);
      if (!candidate.includes("/") && stdout.trim()) return stdout.trim();
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

function runtimeRoot(binary: string): string {
  if (binary.endsWith("/bin/whisper-cli") && binary.includes("/runtimes/whisper/")) return dirname(dirname(binary));
  if (binary.endsWith("/whisper-cli") && binary.includes("/runtimes/whisper/")) return dirname(binary);
  return dirname(binary);
}

function runtimeLibraryPath(binary: string, existing?: string): string {
  const libraryPath = join(runtimeRoot(binary), "lib");
  return existing ? `${libraryPath}:${existing}` : libraryPath;
}

async function sha256File(filePath: string): Promise<string> {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

function whisperLanguage(language: string): string {
  const map: Record<string, string> = {
    zh: "zh",
    auto: "auto",
    en: "en",
    ja: "ja",
    ko: "ko",
    es: "es",
    fr: "fr",
    de: "de"
  };
  return map[language] ?? language;
}
