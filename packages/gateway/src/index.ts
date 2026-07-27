import { createLogger, listen, type RunningServer } from "@vpc/server";

import { packages } from "./packages.js";

const SHUTDOWN_TIMEOUT_MS = 10_000;

const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
type LogLevel = (typeof LOG_LEVELS)[number];

/** Validates rather than casts, so a typo'd LOG_LEVEL cannot silently disable logging. */
function readLogLevel(value: string | undefined): LogLevel {
  const found = LOG_LEVELS.find((level) => level === value);
  if (value !== undefined && found === undefined) {
    process.stderr.write(
      `Ignoring unknown LOG_LEVEL "${value}". Expected one of: ${LOG_LEVELS.join(", ")}.\n`,
    );
  }
  return found ?? "info";
}

function readPort(value: string | undefined): number {
  if (value === undefined) {
    return 3000;
  }
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(
      `Invalid PORT "${value}": expected an integer between 0 and 65535.`,
    );
  }
  return port;
}

async function main(): Promise<void> {
  const logger = createLogger({
    level: readLogLevel(process.env.LOG_LEVEL),
    base: { service: "vpc-gateway" },
  });

  const running = await listen({
    packages,
    logger,
    serviceName: "vpc-gateway",
    port: readPort(process.env.PORT),
  });

  logger.info("packages registered", {
    packages: running.registry.packages.map((pkg) => pkg.name),
    procedures: running.registry.entries.length,
  });

  registerShutdownHandlers(running);
}

/** Container orchestrators send SIGTERM; drain in-flight requests before exiting. */
function registerShutdownHandlers(running: RunningServer): void {
  let shuttingDown = false;

  const shutdown = (signal: string) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    running.logger.info("shutting down", { signal });

    const timer = setTimeout(() => {
      running.logger.warn("forced exit after shutdown timeout");
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    timer.unref();

    running
      .close()
      .then(() => process.exit(0))
      .catch((error: unknown) => {
        running.logger.error("shutdown failed", { error: String(error) });
        process.exit(1);
      });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${JSON.stringify({ level: "error", message: String(error) })}\n`,
  );
  process.exit(1);
});
