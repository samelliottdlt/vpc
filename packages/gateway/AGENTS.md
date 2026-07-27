# @vpc/gateway — composition root

The container entry point. Read `.github/copilot-instructions.md` first.

## Scope

- `packages.ts` — the single list of api packages the process hosts.
- `index.ts` — reads configuration from the environment, starts the server, and installs
  signal handlers.

## Invariants

- **No business logic.** If you are writing a handler here, it belongs in a feature package.
- `packages.ts` is the only place that imports feature packages. Adding one touches four
  places: this file, `dependencies` in `package.json`, `references` in `tsconfig.json`, and
  the root `workspaces` array. Missing the tsconfig reference breaks build ordering.
- Configuration is read here and nowhere else. Feature packages receive values through their
  package factory, not through `process.env`.
- SIGTERM and SIGINT drain in-flight requests and exit within `SHUTDOWN_TIMEOUT_MS`. Azure
  Container Apps sends SIGTERM on scale-in and rollout; do not remove this.

## Environment

| Variable    | Default | Meaning                                 |
| ----------- | ------- | --------------------------------------- |
| `PORT`      | `3000`  | Listen port.                            |
| `LOG_LEVEL` | `info`  | `debug` \| `info` \| `warn` \| `error`. |

## Splitting into multiple containers

Do not fragment `packages.ts` speculatively. When a package genuinely needs its own container,
add a second entry point that registers a subset of `packages` and point a second image at it.
The feature package itself does not change. State the reason (independent scaling, release
cadence, or dependency isolation) in the PR.
