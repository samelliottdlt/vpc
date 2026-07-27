import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";

import {
  createRegistry,
  toApiError,
  type ApiPackage,
  type Logger,
  type Registry,
} from "@vpc/api";

import { httpStatusFor } from "./error-mapping.js";
import {
  parseRequest,
  sendJson,
  type HttpRequest,
  type HttpResponse,
} from "./http.js";
import { handleJsonRpc } from "./jsonrpc.js";
import { createLogger } from "./logger.js";
import { createRestRouter } from "./rest.js";
import { resolveRequestId } from "./request-context.js";
import { isRouteMatch } from "./router.js";

export interface CreateAppOptions {
  packages: readonly ApiPackage[];
  logger?: Logger;
  /** Set to null to disable the JSON-RPC transport. */
  jsonRpcPath?: string | null;
  serviceName?: string;
}

/** Plain `node:http` listener, so the app can be mounted anywhere a listener is accepted. */
export type RequestListener = (
  req: IncomingMessage,
  res: ServerResponse,
) => void;

export interface VpcApp {
  handler: RequestListener;
  registry: Registry;
  logger: Logger;
}

export function createApp(options: CreateAppOptions): VpcApp {
  const logger = options.logger ?? createLogger();
  const registry = createRegistry(options.packages);
  const rest = createRestRouter(registry, logger);
  const jsonRpcPath =
    options.jsonRpcPath === undefined ? "/rpc" : options.jsonRpcPath;
  const serviceName = options.serviceName ?? "vpc";

  const route = async (
    request: HttpRequest,
    res: ServerResponse,
    requestId: string,
  ): Promise<HttpResponse> => {
    if (jsonRpcPath !== null && request.path === jsonRpcPath) {
      if (request.method !== "POST") {
        return methodNotAllowed(res, ["POST"]);
      }
      return handleJsonRpc(request, res, registry, logger, requestId);
    }

    if (request.path === "/healthz" && isReadMethod(request.method)) {
      return {
        status: 200,
        body: { status: "ok", uptimeSeconds: Math.round(process.uptime()) },
      };
    }

    if (request.path === "/" && isReadMethod(request.method)) {
      return {
        status: 200,
        body: {
          service: serviceName,
          transports: jsonRpcPath === null ? ["rest"] : ["rest", "jsonrpc"],
          ...registry.describe(),
        },
      };
    }

    const match = rest.find(request.method, request.path);
    if (isRouteMatch(match)) {
      return match.handler(request, res, match.params, requestId);
    }
    if (match !== undefined) {
      return methodNotAllowed(res, match.allowed);
    }

    return {
      status: 404,
      body: {
        error: {
          code: "not_found",
          message: `No route for ${request.method} ${request.path}`,
        },
      },
    };
  };

  const handler: RequestListener = (req, res) => {
    const startedAt = process.hrtime.bigint();
    const request = parseRequest(req);
    // Resolved before routing so every response — meta routes, 404s, failures — is
    // correlatable, not just the ones that reach a procedure.
    const requestId = resolveRequestId(request, res);

    const finish = (status: number) => {
      logger.info("request", {
        requestId,
        method: request.method,
        path: request.path,
        status,
        durationMs:
          Math.round(Number(process.hrtime.bigint() - startedAt) / 1e4) / 100,
      });
    };

    route(request, res, requestId).then(
      (response) => {
        // HEAD must not carry a body, but should otherwise look like the GET.
        sendJson(
          res,
          response.status,
          request.method === "HEAD" ? undefined : response.body,
        );
        finish(response.status);
      },
      (error: unknown) => {
        const apiError = toApiError(error);
        const status = httpStatusFor(apiError.code);
        const fields = {
          requestId,
          method: request.method,
          path: request.path,
          code: apiError.code,
        };

        if (apiError.code === "internal") {
          logger.error(apiError.message, { ...fields, stack: apiError.stack });
          sendJson(res, status, {
            error: { code: "internal", message: "Internal error" },
          });
        } else {
          logger.warn(apiError.message, fields);
          sendJson(res, status, { error: apiError.toJSON() });
        }
        finish(status);
      },
    );
  };

  return { handler, registry, logger };
}

function isReadMethod(method: string): boolean {
  return method === "GET" || method === "HEAD";
}

function methodNotAllowed(
  res: ServerResponse,
  allowed: string[],
): HttpResponse {
  res.setHeader("allow", allowed.join(", "));
  return {
    status: 405,
    body: {
      error: {
        code: "bad_request",
        message: `Method not allowed. Allowed: ${allowed.join(", ")}.`,
      },
    },
  };
}

export interface ListenOptions extends CreateAppOptions {
  port?: number;
  host?: string;
}

export interface RunningServer extends VpcApp {
  server: Server;
  port: number;
  close(): Promise<void>;
}

export async function listen(options: ListenOptions): Promise<RunningServer> {
  const created = createApp(options);
  const port = options.port ?? Number(process.env["PORT"] ?? 3000);
  const host = options.host ?? "0.0.0.0";
  const server = createServer(created.handler);

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  const boundPort =
    typeof address === "object" && address !== null ? address.port : port;

  created.logger.info("server listening", { host, port: boundPort });

  return {
    ...created,
    server,
    port: boundPort,
    close: async () => {
      // Ends idle keep-alive sockets so a drain cannot hang on an idle client.
      server.closeIdleConnections();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}
