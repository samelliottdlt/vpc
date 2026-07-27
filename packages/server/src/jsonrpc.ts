import type { ServerResponse } from "node:http";

import {
  invokeProcedure,
  toApiError,
  type ApiError,
  type Logger,
  type Registry,
} from "@vpc/api";

import {
  isPlainObject,
  readJsonBody,
  type HttpRequest,
  type HttpResponse,
} from "./http.js";
import { rpcCodeFor } from "./error-mapping.js";
import { createRequestContext } from "./request-context.js";

export const JSONRPC_PROTOCOL = "jsonrpc";

type JsonRpcId = string | number | null;

interface JsonRpcRequest {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
  id?: JsonRpcId;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

/**
 * JSON-RPC 2.0 over a single POST endpoint. It reuses the same registry and
 * `invokeProcedure` path as REST, which is the proof that packages stay protocol agnostic:
 * adding a transport never touches a feature package.
 */
export async function handleJsonRpc(
  request: HttpRequest,
  res: ServerResponse,
  registry: Registry,
  logger: Logger,
  requestId: string,
): Promise<HttpResponse> {
  const payload = await readJsonBody(request.raw);

  if (Array.isArray(payload)) {
    if (payload.length === 0) {
      return {
        status: 400,
        body: errorResponse(null, -32600, "Batch must not be empty."),
      };
    }

    const responses = await Promise.all(
      payload.map((entry) =>
        handleSingle(entry, request, res, registry, logger, requestId),
      ),
    );
    const answered = responses.filter(
      (response): response is JsonRpcResponse => response !== null,
    );

    return answered.length === 0
      ? { status: 204, body: undefined }
      : { status: 200, body: answered };
  }

  const response = await handleSingle(
    payload,
    request,
    res,
    registry,
    logger,
    requestId,
  );
  return response === null
    ? { status: 204, body: undefined }
    : { status: 200, body: response };
}

/** Returns `null` for notifications (requests without an `id`). */
async function handleSingle(
  payload: unknown,
  request: HttpRequest,
  res: ServerResponse,
  registry: Registry,
  logger: Logger,
  requestId: string,
): Promise<JsonRpcResponse | null> {
  if (!isValidRequest(payload)) {
    return errorResponse(readId(payload), -32600, "Invalid JSON-RPC request.");
  }

  const isNotification = payload.id === undefined;
  const id = payload.id ?? null;
  const entry = registry.resolve(payload.method);

  if (!entry) {
    return isNotification
      ? null
      : errorResponse(id, -32601, `Method "${payload.method}" not found.`);
  }

  try {
    const context = createRequestContext(
      request,
      res,
      JSONRPC_PROTOCOL,
      logger,
      requestId,
    );
    const result = await invokeProcedure(
      entry.procedure,
      payload.params ?? {},
      context,
    );
    return isNotification
      ? null
      : { jsonrpc: "2.0", id, result: result ?? null };
  } catch (error) {
    const apiError = toApiError(error);
    logFailure(logger, payload.method, apiError);
    return isNotification
      ? null
      : errorResponse(id, rpcCodeFor(apiError.code), apiError.message, {
          code: apiError.code,
          details: apiError.details,
        });
  }
}

function logFailure(logger: Logger, method: string, error: ApiError): void {
  const fields = { method, code: error.code };
  if (error.code === "internal") {
    logger.error(error.message, { ...fields, stack: error.stack });
  } else {
    logger.warn(error.message, fields);
  }
}

function isValidRequest(payload: unknown): payload is JsonRpcRequest {
  if (!isPlainObject(payload)) {
    return false;
  }
  if (payload.jsonrpc !== "2.0" || typeof payload.method !== "string") {
    return false;
  }
  const id = payload.id;
  return (
    id === undefined ||
    id === null ||
    typeof id === "string" ||
    typeof id === "number"
  );
}

function readId(payload: unknown): JsonRpcId {
  if (!isPlainObject(payload)) {
    return null;
  }
  const id = payload.id;
  return typeof id === "string" || typeof id === "number" ? id : null;
}

function errorResponse(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse {
  return {
    jsonrpc: "2.0",
    id,
    error: data === undefined ? { code, message } : { code, message, data },
  };
}
