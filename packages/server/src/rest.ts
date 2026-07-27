import type { ServerResponse } from "node:http";

import {
  invokeProcedure,
  joinPath,
  type Logger,
  type Registry,
} from "@vpc/api";

import {
  isPlainObject,
  readJsonBody,
  type HttpRequest,
  type HttpResponse,
} from "./http.js";
import { createRequestContext } from "./request-context.js";
import { Router } from "./router.js";

export const REST_PROTOCOL = "rest";

type RestHandler = (
  request: HttpRequest,
  res: ServerResponse,
  params: Record<string, string>,
  requestId: string,
) => Promise<HttpResponse>;

/**
 * Maps every procedure that declares a `rest` binding onto `<basePath><path>`. Input is
 * assembled from body, query string, and path params (most specific wins) so handlers never
 * touch transport primitives.
 */
export function createRestRouter(
  registry: Registry,
  logger: Logger,
): Router<RestHandler> {
  const router = new Router<RestHandler>();

  for (const entry of registry.entries) {
    const binding = entry.procedure.rest;
    if (!binding) {
      continue;
    }

    const path = joinPath(entry.package.basePath, binding.path);

    router.add(
      binding.method,
      path,
      async (request, res, params, requestId) => {
        const context = createRequestContext(
          request,
          res,
          REST_PROTOCOL,
          logger,
          requestId,
        );
        const body =
          binding.method === "GET"
            ? undefined
            : await readJsonBody(request.raw);
        const input = {
          ...(isPlainObject(body) ? body : {}),
          ...request.query,
          ...params,
        };

        const output = await invokeProcedure(
          entry.procedure,
          Object.keys(input).length > 0 ? input : (body ?? {}),
          context,
        );

        return output === undefined
          ? { status: 204, body: undefined }
          : { status: 200, body: output };
      },
    );
  }

  return router;
}
