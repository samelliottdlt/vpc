# Copilot instructions

This is the canonical repository-wide instruction file. Nested `AGENTS.md` files scope
guidance to a single package. When working in a package directory, read this file **and**
that package's `AGENTS.md`. Prefer changing one package at a time.

## What this repository is

`vpc` is the backend counterpart to [`samelliottdlt/website`](https://github.com/samelliottdlt/website).
Where the website scopes functionality to **pages**, this repository scopes functionality to
**packages**, and each package maps to a REST endpoint namespace. Everything is compiled
TypeScript shipped as a single container that runs on an Azure VPC.

Use `package.json` and `.nvmrc` as the source of truth for tool versions.

## Architecture

Three layers, strictly one-directional (`feature → api`, `gateway → server → api`):

```
packages/api          contracts only. No transport, no I/O, no dependencies.
packages/server       transport adapters (REST, JSON-RPC). The only HTTP-aware code.
packages/<feature>    one package per endpoint namespace. Depends on @vpc/api only.
packages/gateway      composition root. Lists feature packages and starts one process.
```

Shared TypeScript settings live in `tsconfig.base.json` at the root. There is no package for
them — a workspace package that contains only a config file is ceremony, not architecture.

### The core idea: packages are protocol agnostic

A feature package never imports an HTTP library, never touches a request or response object,
and never knows whether it is being called over REST or JSON-RPC. It declares **procedures**:

```ts
import { defineProcedure, definePackage } from "@vpc/api";

export const now = defineProcedure({
  name: "now", // camelCase, unique in the package
  summary: "Current time as observed inside the vpc.",
  input: nowInput, // any object with `parse(unknown): T` (zod-compatible)
  rest: { method: "GET", path: "/" }, // optional transport binding
  handler: (input, context) => describeTime(new Date(), input.timeZone),
});

export const currentTimePackage = definePackage({
  name: "current-time", // kebab-case, matches the directory name
  procedures: [now],
});
```

`packages/server` reads the registry those definitions produce and projects it onto every
transport:

- **REST** — `GET /current-time` (from `basePath` + `rest.path`). Input is assembled from the
  JSON body, query string, and path params, most specific wins.
- **JSON-RPC 2.0** — `POST /rpc` with `method: "current-time.now"`. Works for every procedure,
  including those with no `rest` binding. Batches and notifications are supported.

Adding a transport means adding an adapter under `packages/server`. It must never require a
change to a feature package. That constraint is the whole point of the split — respect it.

### Transport capabilities

Handlers receive a `RequestContext` carrying `transport.protocol` and
`transport.capabilities` (`streaming`, `bidirectional`). Today every transport is plain
request/response, so both flags are `false`.

A procedure that genuinely cannot work over request/response declares what it needs:

```ts
defineProcedure({ name: "tail", requires: { streaming: true }, ... });
```

`invokeProcedure` then rejects it with `unsupported` (HTTP 501) on transports that cannot
serve it, instead of failing halfway through. Use `requires` for the "setup" concern rather
than branching on `protocol` inside a handler. Branching on `context.transport` is a last
resort and needs a comment explaining why.

### Errors

Throw `ApiError` from `@vpc/api` with a transport-neutral code (`bad_request`, `not_found`,
`conflict`, `unavailable`, ...). Adapters map codes to HTTP statuses and JSON-RPC codes in
`packages/server/src/error-mapping.ts`. Never throw HTTP statuses from a feature package, and
never leak an internal error message: anything that is not an `ApiError` becomes a generic 500.

## Dependency policy

**The runtime has zero external dependencies, and that is a property to defend.** CI fails the
build if an external production dependency appears. The server is built on `node:http`; body
parsing, routing, logging, and the error envelope are all first-party and small.

This is not minimalism for its own sake. The previous Koa + koa-router stack pulled 52
transitive packages into the image and both had open advisories (koa: ReDoS, open redirect,
XSS, host-header injection; path-to-regexp: backtracking regex). We were already
hand-rolling body parsing and the error envelope, so the framework was earning very little.

Before adding **any** dependency:

1. Does Node already do this? (`node:test`, `fetch`, `AbortSignal`, `Intl`, `crypto` — yes,
   usually.)
2. Is it a runtime dependency? Those need a much stronger case than dev tooling.
3. Would it be smaller to write and test the 50 lines ourselves?

The dev toolchain is deliberately short — `eslint`, `typescript-eslint`, `prettier`,
TypeScript, `@types/node`. Notable deliberate absences:

- **No build orchestrator.** `tsc --build` with project references already does topological
  ordering and incremental caching. Turborepo was installing a 22 MB platform binary to
  schedule four `tsc` calls.
- **No `eslint-config-prettier`.** ESLint's `recommended` set contains no formatting rules,
  so there is nothing for it to turn off.
- **No `globals`.** typescript-eslint's recommended config disables `no-undef`, because the
  compiler already knows what is in scope.
- **No `eslint-plugin-prettier`.** Prettier runs as Prettier, not as a lint rule.

### Two TypeScript packages, on purpose

`@typescript/native` is TypeScript 7 and provides `tsc` — that is what builds and type-checks.
The `typescript` entry is aliased to `@typescript/typescript6` because **typescript-eslint
hard-errors on TypeScript 7** and needs the TypeScript 6 API. This mirrors the website repo
and is temporary; collapse it to a single `typescript` dependency once typescript-eslint
supports the TS 7 API.

## The compiler is the primary correctness gate

`tsconfig.base.json` is deliberately stricter than `strict` alone: `noUncheckedIndexedAccess`,
`noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, `noFallthroughCasesInSwitch`,
`noImplicitOverride`, `verbatimModuleSyntax`, `isolatedModules`, `erasableSyntaxOnly`.

Prefer moving a check into the compiler over adding a lint rule: it runs on every build, it
is faster, and it needs no plugin. `noUnusedLocals` is why ESLint's `no-unused-vars` is
switched off — one diagnostic per problem, not two.

On `any`: `strict` bans **implicit** any. There is no compiler flag for **explicit** `any`,
which is the main reason typescript-eslint still earns its place
(`@typescript-eslint/no-explicit-any` is set to `error`). If that rule ever has to go, the
fallback is code review, not a new dependency.

## Deployment shape

One image, one Node process, all packages. This is deliberate:

- In-process calls between packages cost nanoseconds; a container hop costs milliseconds plus
  a network policy, a DNS name, and an ingress rule per package.
- Azure bills per replica, so N small containers is N idle baselines.
- Cold starts and rollout surface stay a single unit.

The registry-based design keeps the door open: splitting a package into its own container is
a new gateway entry point that registers a subset of `packages`, with no change to the
package itself. Do that only when a package needs independent scaling, an independent release
cadence, or isolation for a heavyweight dependency — and say which one in the PR.

Operational endpoints the platform relies on:

- `GET /healthz` — liveness/readiness probe.
- `GET /` — machine-readable description of every package, procedure, and route.
- `x-request-id` — echoed if supplied, generated otherwise. Resolved before routing, so it is
  present on **every** response including 404s and meta routes, and on every log line.

Logs are JSON lines on stdout/stderr so Azure Log Analytics can index fields directly.

## Adding a feature package

1. `packages/<name>/` with `package.json` (`@vpc/<name>`, `"type": "module"`, depends on
   `@vpc/api`), a `tsconfig.json` extending `../../tsconfig.base.json` with a reference to
   `../api`, and `src/index.ts`.
2. Keep pure logic in its own module (for example `now.ts`) and the procedure/package wiring
   in `index.ts`. Test the pure module; it needs no server.
3. Export a `definePackage(...)` result.
4. Register it in `packages/gateway/src/packages.ts`, add the workspace dependency to
   `packages/gateway/package.json`, and add a reference in `packages/gateway/tsconfig.json`.
5. Add the workspace path to the root `package.json` `workspaces` array and a reference in the
   root `tsconfig.json`.
6. Write `packages/<name>/AGENTS.md` describing that package's scope and invariants.

Move code into a shared package only when more than one feature needs it.

## Implementation conventions

- Strict TypeScript. No `any`, no unsafe casts, no `@ts-expect-error` to silence real errors.
- All packages are ESM (`"type": "module"`). Relative imports carry the `.js` extension.
- `verbatimModuleSyntax` is on, so type-only imports must be written `import type`.
- Package directories and `definePackage` names are kebab-case; procedure names are camelCase.
- Every package exports through `src/index.ts`; nothing imports another package's internals.
- Keep secrets in environment variables, read only in the gateway. Optional variables must not
  break a clean build.
- Runtime packages go in `dependencies`, tooling in `devDependencies`.
- Delete abandoned code instead of leaving speculative alternatives behind.

## Validation

Use focused checks while iterating. Before finishing code or dependency work, run from the
repository root:

```bash
npm run prettier
npm run lint
npm run build
npm test
```

`npm run build` is `tsc --build`, which type-checks and emits in dependency order and skips
projects that are already up to date. `npm test` builds first, then runs the Node test runner
against compiled output in every workspace. `npm run clean` removes build state if incremental
output ever looks stale.

Test files are `src/**/*.test.ts` beside the code they cover. Add tests for calculation and
validation behavior, including edge cases and error paths. New transport behavior belongs in
`packages/server/src/server.test.ts`, which drives a real server over both REST and JSON-RPC.

## Container

```bash
docker build -t vpc .
docker run --rm -p 3000:3000 vpc
curl localhost:3000/current-time
```

Two-stage build on `node:24-alpine`. The runtime stage runs `npm ci --omit=dev`, which only
has to link the workspace packages together because there are no external production
dependencies — no compiler, linter, or formatter reaches the image. It runs as the non-root
`node` user.
