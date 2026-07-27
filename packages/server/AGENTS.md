# @vpc/server — transport adapters

The only place in the repository that knows about HTTP. Read
`.github/copilot-instructions.md` first.

## Scope

- `server.ts` — builds the `node:http` request listener: request id, access logging, error
  envelope, `/healthz`, `/`, and transport dispatch. `listen()` returns `close()` for
  graceful shutdown.
- `rest.ts` — projects procedures with a `rest` binding onto `<basePath><path>`.
- `jsonrpc.ts` — JSON-RPC 2.0 over `POST /rpc`, covering every registered procedure.
- `router.ts` — segment-based path matcher with `:param` support.
- `http.ts` — request parsing, JSON body reading with a size limit, JSON responses.
- `error-mapping.ts` — `ApiErrorCode` to HTTP status and JSON-RPC code.
- `request-context.ts` — request id resolution and the `RequestContext` handed to handlers.
- `logger.ts` — JSON-line structured logging.

## Invariants

- **Zero external dependencies.** This package is built on `node:http` and nothing else. It
  previously used Koa and koa-router; that cost 52 transitive packages and shipped two open
  advisories for functionality we had largely already written. Do not reintroduce a
  framework — if something is missing, write and test it here.
- **No regular expressions for routing.** `router.ts` matches by splitting on `/` and
  comparing segments, so the backtracking class of bug behind the `path-to-regexp` advisory is
  structurally impossible. Keep it that way.
- **Adapters serve the registry; they never special-case a package.** No package name may
  appear in this package's source.
- Every transport must funnel through `invokeProcedure` from `@vpc/api`. Do not call
  `procedure.handler` directly — that would skip validation and capability checks.
- Every adapter declares an honest `TransportCapabilities` value. REST and JSON-RPC are
  request/response, so both flags are `false`; do not claim otherwise to unblock a procedure.
- Error responses use the shared envelope `{ "error": { code, message, details? } }`.
  `internal` errors log the stack and return a generic message; everything else logs at `warn`.
- `x-request-id` is resolved in the top-level handler **before routing**, so 404s, 405s, meta
  routes, and failures all carry one. Do not move it back into a per-procedure path.
- A path that exists under a different method returns 405 with an `Allow` header, not 404.
  That distinction lives in `Router.find`.

## Adding a transport

1. New module exporting a handler built from `Registry`.
2. Declare its `TransportCapabilities` truthfully when building the `RequestContext`.
3. Mount it in `createApp` behind an option so it can be disabled.
4. Add coverage to `server.test.ts` proving an existing feature package works over it with no
   change to that package.

Streaming transports are the reason `requires` exists in `@vpc/api`: a streaming adapter sets
`streaming: true` and procedures that need it become reachable without touching feature code.

## Validation

`src/server.test.ts` boots a real server on an ephemeral port and drives it over both
transports with `fetch`. `src/router.test.ts` covers matching in isolation. Add cases for any
routing, error-mapping, or envelope change.
