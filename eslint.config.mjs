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
    // Supabase CLI scratch space: bundled, minified vendor code.
    "supabase/.temp/**",
    // Generated from the database — regenerate, do not hand-edit or lint.
    "src/types/db.ts",
  ]),
]);

export default eslintConfig;
