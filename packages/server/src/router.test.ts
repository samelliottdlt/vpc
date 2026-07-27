import assert from "node:assert/strict";
import test from "node:test";

import { isRouteMatch, Router } from "./router.js";

test("router matches literal paths regardless of surrounding slashes", () => {
  const router = new Router<string>();
  router.add("GET", "/demo/ping", "ping");

  const match = router.find("GET", "/demo/ping/");
  assert.ok(isRouteMatch(match));
  assert.equal(match.handler, "ping");
  assert.deepEqual(match.params, {});
});

test("router extracts named parameters", () => {
  const router = new Router<string>();
  router.add("GET", "/demo/items/:id/revisions/:rev", "item");

  const match = router.find("GET", "/demo/items/42/revisions/7");
  assert.ok(isRouteMatch(match));
  assert.deepEqual(match.params, { id: "42", rev: "7" });
});

test("router prefers a literal route over a parameter at the same position", () => {
  const router = new Router<string>();
  router.add("GET", "/demo/items/new", "literal");
  router.add("GET", "/demo/items/:id", "param");

  const literal = router.find("GET", "/demo/items/new");
  assert.ok(isRouteMatch(literal));
  assert.equal(literal.handler, "literal");
});

test("router reports allowed methods when only the method differs", () => {
  const router = new Router<string>();
  router.add("POST", "/demo/echo", "echo");
  router.add("GET", "/demo/echo", "read");

  const match = router.find("DELETE", "/demo/echo");
  assert.ok(match !== undefined && !isRouteMatch(match));
  assert.deepEqual(match.allowed, ["GET", "HEAD", "POST"]);
});

test("router returns undefined for an unknown path", () => {
  const router = new Router<string>();
  router.add("GET", "/demo/ping", "ping");

  assert.equal(router.find("GET", "/nope"), undefined);
  assert.equal(router.find("GET", "/demo/ping/extra"), undefined);
});

test("router does not treat a parameter as a path separator", () => {
  const router = new Router<string>();
  router.add("GET", "/demo/:id", "item");

  assert.equal(router.find("GET", "/demo/a/b"), undefined);
});
