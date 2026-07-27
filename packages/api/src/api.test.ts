import assert from "node:assert/strict";
import test from "node:test";

import { requestResponseCapabilities, type RequestContext } from "./context.js";
import { ApiError, isApiError } from "./errors.js";
import { defineProcedure, invokeProcedure } from "./procedure.js";
import { createRegistry, definePackage, joinPath } from "./registry.js";
import { noInput, schema } from "./schema.js";

function testContext(overrides: Partial<RequestContext> = {}): RequestContext {
  const noop = () => undefined;
  return {
    requestId: "test",
    receivedAt: new Date(0),
    transport: { protocol: "rest", capabilities: requestResponseCapabilities },
    headers: {},
    signal: new AbortController().signal,
    logger: { debug: noop, info: noop, warn: noop, error: noop },
    ...overrides,
  };
}

test("invokeProcedure parses input before calling the handler", async () => {
  const procedure = defineProcedure({
    name: "echo",
    input: schema((value) => {
      const record = value as { text?: unknown };
      if (typeof record?.text !== "string") {
        throw new Error("text must be a string");
      }
      return { text: record.text };
    }),
    handler: (input) => input.text.toUpperCase(),
  });

  const result = await invokeProcedure(
    procedure,
    { text: "hi" },
    testContext(),
  );
  assert.equal(result, "HI");
});

test("invokeProcedure converts validation failures into bad_request", async () => {
  const procedure = defineProcedure({
    name: "echo",
    input: schema<unknown>(() => {
      throw new Error("nope");
    }),
    handler: () => "unreachable",
  });

  await assert.rejects(
    () => invokeProcedure(procedure, {}, testContext()),
    (error: unknown) => isApiError(error) && error.code === "bad_request",
  );
});

test("invokeProcedure rejects transports missing a required capability", async () => {
  const procedure = defineProcedure({
    name: "tail",
    input: noInput,
    requires: { streaming: true },
    handler: () => "unreachable",
  });

  await assert.rejects(
    () => invokeProcedure(procedure, undefined, testContext()),
    (error: unknown) => isApiError(error) && error.code === "unsupported",
  );
});

test("definePackage rejects duplicate procedure names", () => {
  const procedure = defineProcedure({
    name: "now",
    input: noInput,
    handler: () => 1,
  });
  assert.throws(() =>
    definePackage({ name: "demo", procedures: [procedure, procedure] }),
  );
});

test("definePackage defaults the base path to the package name", () => {
  const pkg = definePackage({
    name: "demo",
    procedures: [
      defineProcedure({ name: "now", input: noInput, handler: () => 1 }),
    ],
  });
  assert.equal(pkg.basePath, "/demo");
});

test("registry resolves fully qualified methods and describes itself", () => {
  const registry = createRegistry([
    definePackage({
      name: "demo",
      procedures: [
        defineProcedure({
          name: "now",
          input: noInput,
          rest: { method: "GET", path: "/" },
          handler: () => 1,
        }),
      ],
    }),
  ]);

  assert.equal(registry.resolve("demo.now")?.procedure.name, "now");
  assert.equal(registry.resolve("demo.missing"), undefined);
  assert.deepEqual(registry.describe().packages[0]?.procedures[0]?.rest, {
    method: "GET",
    path: "/demo",
  });
});

test("ApiError serializes details only when present", () => {
  assert.deepEqual(ApiError.notFound("gone").toJSON(), {
    code: "not_found",
    message: "gone",
  });
  assert.deepEqual(
    ApiError.badRequest("bad", { details: { field: "x" } }).toJSON(),
    {
      code: "bad_request",
      message: "bad",
      details: { field: "x" },
    },
  );
});

test("joinPath collapses slashes and trims trailing separators", () => {
  assert.equal(joinPath("/demo", "/"), "/demo");
  assert.equal(joinPath("/demo", "/items/:id"), "/demo/items/:id");
});
