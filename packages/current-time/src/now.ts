import { ApiError, schema, type Schema } from "@vpc/api";

export interface NowInput {
  /** IANA time zone name. Defaults to the container's configured zone. */
  timeZone?: string;
}

export interface NowOutput {
  /** Milliseconds since the Unix epoch, the only value that is zone independent. */
  epochMs: number;
  /** UTC instant in ISO-8601. */
  iso: string;
  timeZone: string;
  /** Human readable rendering of the instant in `timeZone`. */
  formatted: string;
  /** Offset of `timeZone` from UTC at this instant, in minutes. */
  offsetMinutes: number;
}

export const nowInput: Schema<NowInput> = schema((value) => {
  if (value === undefined || value === null) {
    return {};
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const timeZone = (value as Record<string, unknown>).timeZone;
  if (timeZone === undefined || timeZone === null || timeZone === "") {
    return {};
  }

  if (typeof timeZone !== "string") {
    throw new Error("timeZone must be a string IANA time zone name.");
  }

  return { timeZone };
});

/** Pure formatter so the behavior is testable without a clock or a server. */
export function describeTime(instant: Date, timeZone: string): NowOutput {
  assertTimeZone(timeZone);

  return {
    epochMs: instant.getTime(),
    iso: instant.toISOString(),
    timeZone,
    formatted: new Intl.DateTimeFormat("en-US", {
      timeZone,
      dateStyle: "full",
      timeStyle: "long",
    }).format(instant),
    offsetMinutes: offsetMinutesFor(instant, timeZone),
  };
}

export function defaultTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
}

function assertTimeZone(timeZone: string): void {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
  } catch (error) {
    throw ApiError.badRequest(`Unknown time zone "${timeZone}".`, {
      cause: error,
      details: { timeZone },
    });
  }
}

/**
 * `Intl` exposes no offset accessor, so we read the wall-clock parts in the target zone
 * and diff them against the same instant in UTC.
 */
function offsetMinutesFor(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  const asUtc = Date.UTC(
    read("year"),
    read("month") - 1,
    read("day"),
    read("hour") % 24,
    read("minute"),
    read("second"),
  );

  const instantToSecond = instant.getTime() - instant.getMilliseconds();
  return Math.round((asUtc - instantToSecond) / 60000);
}
