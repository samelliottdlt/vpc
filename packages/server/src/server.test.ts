import assert from "node:assert/strict";
import test from "node:test";

import {
  ApiError,
  defineProcedure,
  definePackage,
  noInput,
  schema,
} from "@vpc/api";

import { createLogger } from "./logger.js";
import { listen, type RunningServer } from "./server.js";

const demo = definePackage({
  name: "demo",
  description: "fixture package",
  procedures: [
    defineProcedure({
      name: "ping",
      input: noInput,
      rest: { method: "GET", path: "/ping" },
      handler: (_input, context) => ({ protocol: context.transport.protocol }),
    }),
    defineProcedure({
      name: "echo",
      input: schema((value) => {
        const text = (value as { text?: unknown }).text;
        if (typeof text !== "string") {
          throw new Error("text is required");
        }
        return { text };
      }),
      rest: { method: "POST", path: "/echo" },
      handler: (input) => ({ text: input.text }),
    }),
    defineProcedure({
      name: "boom",
      input: noInput,
      rest: { method: "GET", path: "/boom" },
      handler: () => {
        throw ApiError.notFound("nothing here");
      },
    }),
    defineProcedure({
      name: "rpcOnly",
      input: noInput,
      handler: () => "rpc",
    }),
  ],
});

const silentLogger = createLogger({ level: "error", write: () => undefined });

async function withServer(
  run: (server: RunningServer) => Promise<void>,
): Promise<void> {
  const server = await listen({
    packages: [demo],
    logger: silentLogger,
    port: 0,
    host: "127.0.0.1",
  });
  try {
    await run(server);
  } finally {
    await server.close();
  }
}

const url = (server: RunningServer, path: string) =>
  `http://127.0.0.1:${server.port}${path}`;

test("rest exposes procedures under their package base path", async () => {
  await withServer(async (server) => {
    const response = await fetch(url(server, "/demo/ping"));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { protocol: "rest" });
    assert.ok(response.headers.get("x-request-id"));
  });
});

test("rest merges the json body into procedure input", async () => {
  await withServer(async (server) => {
    const response = await fetch(url(server, "/demo/echo"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "hello" }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { text: "hello" });
  });
});

test("rest maps api errors onto status codes and an error envelope", async () => {
  await withServer(async (server) => {
    const notFound = await fetch(url(server, "/demo/boom"));
    assert.equal(notFound.status, 404);
    assert.deepEqual(await notFound.json(), {
      error: { code: "not_found", message: "nothing here" },
    });

    const invalid = await fetch(url(server, "/demo/echo"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(invalid.status, 400);

    const missing = await fetch(url(server, "/nope"));
    assert.equal(missing.status, 404);
  });
});

test("procedures without a rest binding stay reachable over json-rpc", async () => {
  await withServer(async (server) => {
    const response = await fetch(url(server, "/rpc"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "demo.rpcOnly" }),
    });
    assert.deepEqual(await response.json(), {
      jsonrpc: "2.0",
      id: 1,
      result: "rpc",
    });
  });
});

test("json-rpc reports the protocol, handles batches, and surfaces errors", async () => {
  await withServer(async (server) => {
    const response = await fetch(url(server, "/rpc"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify([
        { jsonrpc: "2.0", id: 1, method: "demo.ping" },
        { jsonrpc: "2.0", id: 2, method: "demo.missing" },
        { jsonrpc: "2.0", method: "demo.ping" },
      ]),
    });

    const body = (await response.json()) as {
      id: number;
      result?: unknown;
      error?: unknown;
    }[];
    assert.equal(body.length, 2, "notifications get no response");
    assert.deepEqual(body[0], {
      jsonrpc: "2.0",
      id: 1,
      result: { protocol: "jsonrpc" },
    });
    assert.equal((body[1] as { error: { code: number } }).error.code, -32601);
  });
});

test("the root route describes every registered package", async () => {
  await withServer(async (server) => {
    const response = await fetch(url(server, "/"));
    const body = (await response.json()) as {
      transports: string[];
      packages: { name: string; procedures: { method: string }[] }[];
    };
    assert.deepEqual(body.transports, ["rest", "jsonrpc"]);
    assert.equal(body.packages[0]?.name, "demo");
    assert.ok(
      body.packages[0]?.procedures.some(
        (entry) => entry.method === "demo.rpcOnly",
      ),
    );
  });
});

test("healthz answers without touching the registry", async () => {
  await withServer(async (server) => {
    const response = await fetch(url(server, "/healthz"));
    assert.equal(response.status, 200);
    assert.equal(((await response.json()) as { status: string }).status, "ok");
  });
});

test("a known path with the wrong method returns 405 and an Allow header", async () => {
  await withServer(async (server) => {
    const response = await fetch(url(server, "/demo/echo"), {
      method: "DELETE",
    });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("allow"), "POST");
  });
});

test("HEAD mirrors GET status without a body", async () => {
  await withServer(async (server) => {
    const response = await fetch(url(server, "/healthz"), { method: "HEAD" });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "");
  });
});

test("oversized and malformed bodies are rejected as bad_request", async () => {
  await withServer(async (server) => {
    const response = await fetch(url(server, "/demo/echo"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    assert.equal(response.status, 400);
    assert.equal(
      ((await response.json()) as { error: { code: string } }).error.code,
      "bad_request",
    );
  });
});

test("the caller's x-request-id is echoed back", async () => {
  await withServer(async (server) => {
    const response = await fetch(url(server, "/demo/ping"), {
      headers: { "x-request-id": "abc-123" },
    });
    assert.equal(response.headers.get("x-request-id"), "abc-123");
  });
});

test("every response carries a request id, including meta routes and 404s", async () => {
  await withServer(async (server) => {
    for (const path of ["/", "/healthz", "/nope", "/demo/boom"]) {
      const response = await fetch(url(server, path));
      assert.ok(
        response.headers.get("x-request-id"),
        `${path} should carry a request id`,
      );
    }
  });
});

test("jsonRpcPath null disables the rpc transport", async () => {
  const server = await listen({
    packages: [demo],
    logger: silentLogger,
    port: 0,
    host: "127.0.0.1",
    jsonRpcPath: null,
  });
  try {
    const response = await fetch(url(server, "/rpc"), {
      method: "POST",
      body: "{}",
    });
    assert.equal(response.status, 404);

    const root = await fetch(url(server, "/"));
    assert.deepEqual(
      ((await root.json()) as { transports: string[] }).transports,
      ["rest"],
    );
  } finally {
    await server.close();
  }
});
