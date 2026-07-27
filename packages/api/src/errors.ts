/**
 * Transport-neutral error taxonomy. Feature packages throw these; adapters decide how
 * each code maps onto their wire format (HTTP status, JSON-RPC code, ...).
 */
export type ApiErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "unsupported"
  | "unavailable"
  | "internal";

export interface ApiErrorOptions {
  details?: unknown;
  cause?: unknown;
}

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly details?: unknown;

  constructor(
    code: ApiErrorCode,
    message: string,
    options: ApiErrorOptions = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "ApiError";
    this.code = code;
    this.details = options.details;
  }

  static badRequest(message: string, options?: ApiErrorOptions): ApiError {
    return new ApiError("bad_request", message, options);
  }

  static unauthorized(
    message = "Unauthorized",
    options?: ApiErrorOptions,
  ): ApiError {
    return new ApiError("unauthorized", message, options);
  }

  static forbidden(message = "Forbidden", options?: ApiErrorOptions): ApiError {
    return new ApiError("forbidden", message, options);
  }

  static notFound(message = "Not found", options?: ApiErrorOptions): ApiError {
    return new ApiError("not_found", message, options);
  }

  static conflict(message: string, options?: ApiErrorOptions): ApiError {
    return new ApiError("conflict", message, options);
  }

  static unsupported(message: string, options?: ApiErrorOptions): ApiError {
    return new ApiError("unsupported", message, options);
  }

  static unavailable(message: string, options?: ApiErrorOptions): ApiError {
    return new ApiError("unavailable", message, options);
  }

  static internal(
    message = "Internal error",
    options?: ApiErrorOptions,
  ): ApiError {
    return new ApiError("internal", message, options);
  }

  toJSON(): { code: ApiErrorCode; message: string; details?: unknown } {
    return this.details === undefined
      ? { code: this.code, message: this.message }
      : { code: this.code, message: this.message, details: this.details };
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

/** Normalizes anything thrown by a handler into an `ApiError`. */
export function toApiError(value: unknown): ApiError {
  if (isApiError(value)) {
    return value;
  }

  const message = value instanceof Error ? value.message : "Internal error";
  return new ApiError("internal", message, { cause: value });
}
