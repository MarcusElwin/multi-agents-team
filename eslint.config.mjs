import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The eve agent project is compiled/deployed by eve's own toolchain
    // (`eve dev` / `vercel deploy`), not the Next build — keep it out of the
    // app's lint/typecheck (it depends on the `eve` package, not installed here).
    "eve-app/**",
  ]),
]);

export default eslintConfig;
