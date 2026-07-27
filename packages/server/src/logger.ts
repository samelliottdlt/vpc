import type { Logger } from "@vpc/api";

type Level = "debug" | "info" | "warn" | "error";

const levels: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface LoggerOptions {
  level?: Level;
  base?: Record<string, unknown>;
  /** Injected for tests. Defaults to writing JSON lines to stdout/stderr. */
  write?: (line: string, level: Level) => void;
}

/**
 * Structured JSON logging so Azure Container Apps / Log Analytics can index fields
 * instead of scraping free-form text.
 */
export function createLogger(options: LoggerOptions = {}): Logger & {
  child(fields: Record<string, unknown>): Logger;
} {
  const minimum = levels[options.level ?? "info"];
  const base = options.base ?? {};
  const write =
    options.write ??
    ((line: string, level: Level) => {
      if (level === "error" || level === "warn") {
        process.stderr.write(`${line}\n`);
      } else {
        process.stdout.write(`${line}\n`);
      }
    });

  const emit = (
    level: Level,
    message: string,
    fields?: Record<string, unknown>,
  ) => {
    if (levels[level] < minimum) {
      return;
    }
    write(
      JSON.stringify({
        time: new Date().toISOString(),
        level,
        message,
        ...base,
        ...fields,
      }),
      level,
    );
  };

  return {
    debug: (message, fields) => emit("debug", message, fields),
    info: (message, fields) => emit("info", message, fields),
    warn: (message, fields) => emit("warn", message, fields),
    error: (message, fields) => emit("error", message, fields),
    child: (fields) =>
      createLogger({ ...options, base: { ...base, ...fields } }),
  };
}
