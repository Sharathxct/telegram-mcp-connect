import { Logger } from "teleproto";

export type TgLogLevel = "none" | "error" | "warn" | "info" | "debug";

const LEVELS: TgLogLevel[] = ["none", "error", "warn", "info", "debug"];

export function resolveLogLevel(raw: string | undefined): TgLogLevel {
  const value = (raw || "").toLowerCase() as TgLogLevel;
  return LEVELS.includes(value) ? value : "none";
}

export function createStderrLogger(level: TgLogLevel = resolveLogLevel(process.env.TG_MCP_LOG_LEVEL)): Logger {
  const logger = new Logger(level as never);
  logger.log = (lvl: string, message: string) => {
    process.stderr.write(`[telegram-mcp-connect] [${String(lvl).toUpperCase()}] ${message}\n`);
  };
  return logger;
}

export function protectStdout(): void {
  const toStderr =
    (tag: string) =>
    (...args: unknown[]) => {
      const text = args
        .map((a) => (typeof a === "string" ? a : safeInspect(a)))
        .join(" ");
      process.stderr.write(`[telegram-mcp-connect] [${tag}] ${text}\n`);
    };
  console.log = toStderr("log");
  console.info = toStderr("info");
  console.warn = toStderr("warn");
  console.debug = toStderr("debug");
  console.error = toStderr("error");
}

function safeInspect(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
