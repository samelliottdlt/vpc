import js from "@eslint/js";
import tseslint from "typescript-eslint";

/**
 * Deliberately minimal. Two packages do all the work:
 *
 * - `eslint` + `@eslint/js` for the core correctness rules.
 * - `typescript-eslint` for the TypeScript parser and its rules. ESLint core still ships no
 *   TypeScript parser, so this is not optional.
 *
 * Formatting is Prettier's job alone. `eslint-config-prettier` is not needed because ESLint's
 * `recommended` set contains no formatting rules to conflict with. Unused variables are the
 * compiler's job (`noUnusedLocals` / `noUnusedParameters`), so the lint rule is off to avoid
 * reporting the same problem twice.
 */
export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
);
