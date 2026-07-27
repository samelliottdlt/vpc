/**
 * Minimal structural schema interface. Any object exposing `parse` works, which makes
 * `zod`, `valibot`, or a hand written guard drop-in compatible. Keeping this structural
 * avoids forcing a validation library onto every feature package.
 */
export interface Schema<T> {
  parse(value: unknown): T;
}

export type Infer<S> = S extends Schema<infer T> ? T : never;

/** Builds a schema from a plain parse function. */
export function schema<T>(parse: (value: unknown) => T): Schema<T> {
  return { parse };
}

/** Procedures that take no input. Adapters still pass the raw payload, we discard it. */
export const noInput: Schema<void> = schema(() => undefined);

/** Accepts the payload as-is. Use only when the handler validates internally. */
export function unchecked<T>(): Schema<T> {
  return schema((value) => value as T);
}
