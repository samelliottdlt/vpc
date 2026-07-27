import type { IncomingMessage, ServerResponse } from "node:http";

import { ApiError } from "@vpc/api";

export interface HttpRequest {
  method: string;
  /** Path without the query string. */
  path: string;
  query: Readonly<Record<string, string>>;
  headers: Readonly<Record<string, string>>;
  raw: IncomingMessage;
}

export interface HttpResponse {
  status: number;
  body: unknown;
}

const DEFAULT_LIMIT_BYTES = 1024 * 1024;

export function parseRequest(req: IncomingMessage): HttpRequest {
  // `req.url` is origin-form; the base is only needed to satisfy the URL parser.
  const url = new URL(req.url ?? "/", "http://localhost");
  const query: Record<string, string> = {};
  for (const [key, value] of url.searchParams) {
    query[key] = value;
  }

  return {
    method: req.method ?? "GET",
    path: decodeURIComponent(url.pathname),
    query,
    headers: normalizeHeaders(req.headers),
    raw: req,
  };
}

function normalizeHeaders(
  headers: NodeJS.Dict<string | string[]>,
): Readonly<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) {
      continue;
    }
    result[key.toLowerCase()] = Array.isArray(value) ? value.join(",") : value;
  }
  return Object.freeze(result);
}

/**
 * Reads and parses a JSON request body. Node gives us a stream and `JSON.parse`, which is
 * the whole job, so a body-parser dependency would not earn its keep.
 */
export async function readJsonBody(
  req: IncomingMessage,
  limitBytes = DEFAULT_LIMIT_BYTES,
): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk)
      ? chunk
      : Buffer.from(chunk as string);
    size += buffer.byteLength;
    if (size > limitBytes) {
      throw ApiError.badRequest(`Request body exceeds ${limitBytes} bytes.`);
    }
    chunks.push(buffer);
  }

  if (size === 0) {
    return undefined;
  }

  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (text.length === 0) {
    return undefined;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw ApiError.badRequest("Request body is not valid JSON.", {
      cause: error,
    });
  }
}

export function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  if (res.writableEnded) {
    return;
  }

  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }

  if (body === undefined) {
    res.writeHead(status);
    res.end();
    return;
  }

  const payload = Buffer.from(JSON.stringify(body), "utf8");
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": String(payload.byteLength),
  });
  res.end(payload);
}

export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
