import type { ApiErrorCode } from "@vpc/api";

const statusByCode: Record<ApiErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  unsupported: 501,
  unavailable: 503,
  internal: 500,
};

/** JSON-RPC 2.0 reserves -32768..-32000; application errors live in -32099..-32000. */
const rpcCodeByCode: Record<ApiErrorCode, number> = {
  bad_request: -32602,
  unauthorized: -32001,
  forbidden: -32003,
  not_found: -32004,
  conflict: -32009,
  rate_limited: -32029,
  unsupported: -32601,
  unavailable: -32002,
  internal: -32603,
};

export function httpStatusFor(code: ApiErrorCode): number {
  return statusByCode[code] ?? 500;
}

export function rpcCodeFor(code: ApiErrorCode): number {
  return rpcCodeByCode[code] ?? -32603;
}
