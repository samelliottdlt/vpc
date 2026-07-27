/**
 * Minimal path router. Routes are matched by splitting on "/" and comparing segment by
 * segment, so there is no regular expression to backtrack — the class of bug behind the
 * `path-to-regexp` advisory is structurally absent.
 *
 * Supported syntax: literal segments and `:name` parameters. That is everything the REST
 * bindings in this repository use.
 */
export interface RouteMatch<T> {
  handler: T;
  params: Record<string, string>;
}

interface Route<T> {
  method: string;
  segments: string[];
  handler: T;
}

export class Router<T> {
  readonly #routes: Route<T>[] = [];

  add(method: string, path: string, handler: T): void {
    this.#routes.push({
      method: method.toUpperCase(),
      segments: splitPath(path),
      handler,
    });
  }

  /**
   * Returns the matching route, or the set of methods allowed at this path when the path
   * matches but the method does not. That distinction is what separates a 404 from a 405.
   */
  find(
    method: string,
    path: string,
  ): RouteMatch<T> | { allowed: string[] } | undefined {
    const segments = splitPath(path);
    const allowed = new Set<string>();

    for (const route of this.#routes) {
      const params = matchSegments(route.segments, segments);
      if (params === undefined) {
        continue;
      }

      if (route.method === method.toUpperCase()) {
        return { handler: route.handler, params };
      }

      allowed.add(route.method);
      if (route.method === "GET") {
        allowed.add("HEAD");
      }
    }

    return allowed.size > 0 ? { allowed: [...allowed].sort() } : undefined;
  }
}

export function isRouteMatch<T>(
  value: RouteMatch<T> | { allowed: string[] } | undefined,
): value is RouteMatch<T> {
  return value !== undefined && "handler" in value;
}

function splitPath(path: string): string[] {
  return path.split("/").filter((segment) => segment.length > 0);
}

function matchSegments(
  pattern: string[],
  actual: string[],
): Record<string, string> | undefined {
  if (pattern.length !== actual.length) {
    return undefined;
  }

  const params: Record<string, string> = {};
  for (let index = 0; index < pattern.length; index += 1) {
    const expected = pattern[index] as string;
    const received = actual[index] as string;

    if (expected.startsWith(":")) {
      params[expected.slice(1)] = received;
      continue;
    }

    if (expected !== received) {
      return undefined;
    }
  }

  return params;
}
