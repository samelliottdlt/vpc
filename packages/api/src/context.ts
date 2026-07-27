/**
 * Everything a handler is allowed to know about the transport that invoked it.
 * Handlers should stay agnostic; the capability flags exist so a package can *refuse*
 * to run under a transport that cannot support it (for example a future streaming
 * procedure asked to run over plain request/response REST).
 */
/** Known protocols keep autocomplete; any string is still allowed for new transports. */
export type ProtocolName = "rest" | "jsonrpc" | (string & NonNullable<unknown>);

export interface TransportCapabilities {
  /** The transport can emit more than one message per request. */
  streaming: boolean;
  /** The caller can keep sending messages after the initial request. */
  bidirectional: boolean;
}

export interface TransportInfo {
  protocol: ProtocolName;
  capabilities: TransportCapabilities;
}

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

export interface RequestContext {
  /** Correlates every log line and response for a single inbound call. */
  requestId: string;
  receivedAt: Date;
  transport: TransportInfo;
  /** Lower-cased transport metadata. Empty for transports without headers. */
  headers: Readonly<Record<string, string>>;
  /** Aborted when the caller disconnects or the host is shutting down. */
  signal: AbortSignal;
  logger: Logger;
}

export const requestResponseCapabilities: TransportCapabilities = {
  streaming: false,
  bidirectional: false,
};
