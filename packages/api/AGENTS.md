# @vpc/api — shared contracts

The vocabulary every other package speaks. Read `.github/copilot-instructions.md` first.

## Scope

- Procedure and package definitions (`defineProcedure`, `definePackage`).
- The registry that transports enumerate (`createRegistry`).
- The request context and transport capability model.
- The transport-neutral error taxonomy (`ApiError`).
- The structural `Schema<T>` interface.

## Invariants

- **Zero dependencies, including dev.** No HTTP, no filesystem, no validation library. If a
  change here needs a dependency, it belongs in `@vpc/server` or a feature package instead.
- `Schema<T>` stays structural (`{ parse(value: unknown): T }`) so `zod`, `valibot`, or a hand
  written guard all drop in without this package picking a winner.
- `invokeProcedure` is the single funnel every transport calls. Validation, capability checks,
  and error normalization live there so protocols cannot drift apart.
- Anything a handler is allowed to learn about its transport goes on `RequestContext`. Do not
  widen it with transport primitives (no raw sockets, no `ctx`, no `req`/`res`).
- Adding a `TransportCapabilities` flag is a breaking change for adapters: every adapter must
  declare a value for it.
- Names are validated at definition time on purpose — procedures camelCase, packages
  kebab-case. Keep the checks.

## Changing this package

Every other package depends on it, so prefer additive changes. When a change is breaking,
update `@vpc/server` and all feature packages in the same commit.

`src/api.test.ts` covers validation funnelling, capability rejection, registry resolution, and
error serialization. Extend it whenever you touch those paths.
