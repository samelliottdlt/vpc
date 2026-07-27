import type { RequestContext, TransportCapabilities } from "./context.js";
import { ApiError } from "./errors.js";
import type { Schema } from "./schema.js";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * Optional REST binding. Omit it and the procedure is still reachable over every
 * non-REST transport (JSON-RPC today), which is the point of keeping bindings separate
 * from the procedure itself.
 */
export interface RestBinding {
  method: HttpMethod;
  /** Path relative to the package base path, e.g. `/` or `/:id`. */
  path: string;
}

export type ProcedureHandler<TInput, TOutput> = (
  input: TInput,
  context: RequestContext,
) => TOutput | Promise<TOutput>;

export interface ProcedureDefinition<TInput, TOutput> {
  /** Unique within its package. Used as the JSON-RPC method suffix. */
  name: string;
  summary?: string;
  input: Schema<TInput>;
  /** Transport features the handler cannot run without. Defaults to none. */
  requires?: Partial<TransportCapabilities>;
  rest?: RestBinding;
  handler: ProcedureHandler<TInput, TOutput>;
}

/** Erased procedure shape used by the registry and transport adapters. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyProcedure = ProcedureDefinition<any, unknown>;

export function defineProcedure<TInput, TOutput>(
  definition: ProcedureDefinition<TInput, TOutput>,
): ProcedureDefinition<TInput, TOutput> {
  if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(definition.name)) {
    throw new Error(
      `Invalid procedure name "${definition.name}": expected camelCase.`,
    );
  }

  if (definition.rest && !definition.rest.path.startsWith("/")) {
    throw new Error(
      `Invalid rest path "${definition.rest.path}": must start with "/".`,
    );
  }

  return definition;
}

/**
 * Runs a procedure against an already-assembled raw payload. Every transport adapter
 * funnels through here so validation, capability checks, and error normalization stay
 * identical across protocols.
 */
export async function invokeProcedure(
  procedure: AnyProcedure,
  rawInput: unknown,
  context: RequestContext,
): Promise<unknown> {
  assertCapabilities(procedure, context);

  let input: unknown;
  try {
    input = procedure.input.parse(rawInput);
  } catch (error) {
    throw ApiError.badRequest(
      error instanceof Error ? error.message : "Invalid request input",
      { cause: error, details: { procedure: procedure.name } },
    );
  }

  return procedure.handler(input, context);
}

function assertCapabilities(
  procedure: AnyProcedure,
  context: RequestContext,
): void {
  const required = procedure.requires;
  if (!required) {
    return;
  }

  const missing = (
    Object.keys(required) as (keyof TransportCapabilities)[]
  ).filter(
    (key) =>
      required[key] === true && context.transport.capabilities[key] !== true,
  );

  if (missing.length > 0) {
    throw ApiError.unsupported(
      `Procedure "${procedure.name}" requires transport capabilities: ${missing.join(", ")}.`,
      { details: { protocol: context.transport.protocol, missing } },
    );
  }
}
