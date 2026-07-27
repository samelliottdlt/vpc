# vpc

Things that I run in a vpc. This is the backend counterpart to
[`samelliottdlt/website`](https://github.com/samelliottdlt/website): where the website scopes
functionality to pages, this repository scopes functionality to packages, and each package
maps to a REST endpoint namespace.

**The runtime has zero external dependencies.** The server is built directly on `node:http`,
and CI fails if an external production dependency ever appears.

## Layout

| Package                 | Role                                                            |
| ----------------------- | --------------------------------------------------------------- |
| `packages/api`          | Protocol-agnostic contracts.                                    |
| `packages/server`       | Transport adapters (REST, JSON-RPC). The only HTTP-aware code.  |
| `packages/current-time` | Feature package: current time as observed inside the vpc.       |
| `packages/gateway`      | Composition root. Hosts every package in one container process. |

Feature packages declare procedures; they never import an HTTP library and never see a
request object. The server projects the resulting registry onto every transport, so a package
written once is reachable over REST today and over anything added later.

## Endpoints

```
GET  /                              description of every package and route
GET  /healthz                       liveness / readiness probe
GET  /current-time?timeZone=UTC     the current time in the vpc
POST /rpc                           JSON-RPC 2.0, method "current-time.now"
```

## Local development

Requires the Node version in `.nvmrc`.

```bash
npm ci
npm run build
npm start
curl localhost:3000/current-time
```

Checks:

```bash
npm run prettier   # format
npm run lint
npm run build      # tsc --build: type-checks and emits in dependency order
npm test           # builds, then runs node:test against compiled output
npm run clean      # drop incremental build state
```

## Toolchain

`eslint` + `typescript-eslint`, `prettier`, TypeScript, `@types/node`. That is the whole list.
There is no build orchestrator: `tsc --build` with project references already handles
topological ordering and incremental caching.

TypeScript appears twice on purpose. `@typescript/native` is TypeScript 7 and provides `tsc`;
the `typescript` entry is aliased to `@typescript/typescript6` because typescript-eslint does
not yet support the TypeScript 7 API. This mirrors the website repo and collapses to one
dependency once that lands.

## Container

```bash
docker build -t vpc .
docker run --rm -p 3000:3000 vpc
```

Configuration: `PORT` (default `3000`) and `LOG_LEVEL` (default `info`). Logs are JSON lines
on stdout/stderr, and every response carries an `x-request-id`. The image runs as the
non-root `node` user and contains no compiler, linter, or formatter.

## Agent guidance

`.github/copilot-instructions.md` holds the repository-wide architecture, dependency policy,
and conventions. Each package has an `AGENTS.md` scoping its own responsibilities and
invariants.
