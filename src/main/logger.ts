import { appendFileSync, mkdirSync, statSync, renameSync } from "node:fs";
import { dirname } from "node:path";
import { inspect } from "node:util";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(message: string, meta?: unknown): void;
  info(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
  path(): string | null;
}

const maxLogBytes = 2 * 1024 * 1024;
let logFilePath: string | null = null;

export function initLogger(filePath: string): Logger {
  logFilePath = filePath;
  mkdirSync(dirname(filePath), { recursive: true });
  rotateIfNeeded(filePath);
  write("info", "Logger initialized", { filePath });
  return logger;
}

export const logger: Logger = {
  debug: (message, meta) => write("debug", message, meta),
  info: (message, meta) => write("info", message, meta),
  warn: (message, meta) => write("warn", message, meta),
  error: (message, meta) => write("error", message, meta),
  path: () => logFilePath
};

function write(level: LogLevel, message: string, meta?: unknown): void {
  const line = `${new Date().toISOString()} ${level.toUpperCase()} ${message}${formatMeta(meta)}\n`;

  if (level === "error") {
    console.error(line.trimEnd());
  } else if (level === "warn") {
    console.warn(line.trimEnd());
  } else {
    console.log(line.trimEnd());
  }

  if (!logFilePath) return;

  try {
    rotateIfNeeded(logFilePath);
    appendFileSync(logFilePath, line, "utf8");
  } catch (error) {
    console.error("BriefInk logger failed", error);
  }
}

function formatMeta(meta: unknown): string {
  if (typeof meta === "undefined") return "";
  if (meta instanceof Error) {
    return ` ${JSON.stringify({ name: meta.name, message: meta.message, stack: meta.stack })}`;
  }
  return ` ${inspect(meta, { depth: 4, breakLength: 160, compact: true })}`;
}

function rotateIfNeeded(filePath: string): void {
  try {
    const stat = statSync(filePath);
    if (stat.size < maxLogBytes) return;
    renameSync(filePath, `${filePath}.1`);
  } catch {
    // No existing log file yet.
  }
}
