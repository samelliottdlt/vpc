import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

import {
  requestResponseCapabilities,
  type Logger,
  type ProtocolName,
  type RequestContext,
} from "@vpc/api";

import type { HttpRequest } from "./http.js";

export const REQUEST_ID_HEADER = "x-request-id";

/**
 * Echoes the caller's request id or mints one, and pins it to the response. Called once per
 * request at the very top of the handler so that meta routes, 404s, and failures are all
 * correlatable, not just the requests that reach a procedure.
 */
export function resolveRequestId(
  request: HttpRequest,
  res: ServerResponse,
): string {
  const supplied = request.headers[REQUEST_ID_HEADER];
  const requestId =
    supplied !== undefined && supplied.length > 0 ? supplied : randomUUID();
  res.setHeader(REQUEST_ID_HEADER, requestId);
  return requestId;
}

/**
 * Builds the transport-neutral context handed to every procedure. Adapters differ only in
 * the protocol name and capability set they declare.
 */
export function createRequestContext(
  request: HttpRequest,
  res: ServerResponse,
  protocol: ProtocolName,
  logger: Logger,
  requestId: string,
): RequestContext {
  return {
    requestId,
    receivedAt: new Date(),
    transport: { protocol, capabilities: requestResponseCapabilities },
    headers: request.headers,
    signal: abortSignalFor(request.raw, res),
    logger,
  };
}

/** Aborts when the caller disconnects, so handlers can stop doing pointless work. */
function abortSignalFor(
  req: IncomingMessage,
  res: ServerResponse,
): AbortSignal {
  const controller = new AbortController();
  const abort = () => controller.abort();

  req.once("aborted", abort);
  res.once("close", () => {
    if (!res.writableFinished) {
      abort();
    }
  });

  return controller.signal;
}
