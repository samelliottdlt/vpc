import type { AnyProcedure } from "./procedure.js";

export interface ApiPackage {
  /** kebab-case, matches the workspace directory name. */
  name: string;
  description?: string;
  /** REST namespace, e.g. `/current-time`. Also the JSON-RPC method prefix. */
  basePath: string;
  procedures: AnyProcedure[];
}

export interface ApiPackageInput {
  name: string;
  description?: string;
  basePath?: string;
  procedures: AnyProcedure[];
}

export function definePackage(input: ApiPackageInput): ApiPackage {
  if (!/^[a-z][a-z0-9-]*$/.test(input.name)) {
    throw new Error(
      `Invalid package name "${input.name}": expected kebab-case.`,
    );
  }

  const basePath = input.basePath ?? `/${input.name}`;
  if (!basePath.startsWith("/")) {
    throw new Error(`Invalid base path "${basePath}": must start with "/".`);
  }

  const seen = new Set<string>();
  for (const procedure of input.procedures) {
    if (seen.has(procedure.name)) {
      throw new Error(
        `Duplicate procedure "${procedure.name}" in package "${input.name}".`,
      );
    }
    seen.add(procedure.name);
  }

  return {
    name: input.name,
    description: input.description,
    basePath,
    procedures: input.procedures,
  };
}

export interface RegisteredProcedure {
  package: ApiPackage;
  procedure: AnyProcedure;
  /** Fully qualified JSON-RPC method, e.g. `current-time.now`. */
  method: string;
}

export interface Registry {
  packages: readonly ApiPackage[];
  entries: readonly RegisteredProcedure[];
  resolve(method: string): RegisteredProcedure | undefined;
  describe(): RegistryDescription;
}

export interface RegistryDescription {
  packages: {
    name: string;
    description?: string;
    basePath: string;
    procedures: {
      name: string;
      method: string;
      summary?: string;
      rest?: { method: string; path: string };
    }[];
  }[];
}

export function createRegistry(packages: readonly ApiPackage[]): Registry {
  const entries: RegisteredProcedure[] = [];
  const byMethod = new Map<string, RegisteredProcedure>();
  const seenPaths = new Set<string>();

  for (const pkg of packages) {
    if (seenPaths.has(pkg.basePath)) {
      throw new Error(`Duplicate base path "${pkg.basePath}" registered.`);
    }
    seenPaths.add(pkg.basePath);

    for (const procedure of pkg.procedures) {
      const entry: RegisteredProcedure = {
        package: pkg,
        procedure,
        method: `${pkg.name}.${procedure.name}`,
      };

      if (byMethod.has(entry.method)) {
        throw new Error(`Duplicate method "${entry.method}" registered.`);
      }

      byMethod.set(entry.method, entry);
      entries.push(entry);
    }
  }

  return {
    packages,
    entries,
    resolve: (method) => byMethod.get(method),
    describe: () => ({
      packages: packages.map((pkg) => ({
        name: pkg.name,
        description: pkg.description,
        basePath: pkg.basePath,
        procedures: pkg.procedures.map((procedure) => ({
          name: procedure.name,
          method: `${pkg.name}.${procedure.name}`,
          summary: procedure.summary,
          rest: procedure.rest
            ? {
                method: procedure.rest.method,
                path: joinPath(pkg.basePath, procedure.rest.path),
              }
            : undefined,
        })),
      })),
    }),
  };
}

export function joinPath(basePath: string, path: string): string {
  const joined = `${basePath}${path}`.replace(/\/{2,}/g, "/");
  return joined.length > 1 && joined.endsWith("/")
    ? joined.slice(0, -1)
    : joined;
}
