import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    rules: {
      "@next/next/no-html-link-for-pages": "off",
    },
  },
  {
    files: ["packages/**/*.ts"],
    rules: {
      "@typescript-eslint/no-restricted-types": "off",
    },
  },
  globalIgnores([
    "**/.next/**",
    "**/node_modules/**",
    "**/dist/**",
    "coverage/**",
    "pnpm-lock.yaml",
  ]),
]);
