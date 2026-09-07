import prettierConfigRecommended from "eslint-plugin-prettier/recommended";
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import simpleImportSort from "eslint-plugin-simple-import-sort";

export default tseslint.config(
  { ignores: ["dist", ".devbox", ".direnv"] },
  prettierConfigRecommended,
  {
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
      {
        languageOptions: {
          parserOptions: {
            projectService: true,
            tsconfigRootDir: import.meta.dirname,
          },
        },
      },
    ],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      "simple-import-sort": simpleImportSort,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        {
          allowConstantExport: true,
          // Every TanStack Router file route must `export const Route =
          // createFileRoute(...)`, which is a call expression rather than a
          // constant, so `allowConstantExport` does not cover it. Without
          // this the rule fires on every route in `src/routes/`, which is
          // not something the codebase can restructure away.
          allowExportNames: ["Route"],
        },
      ],
      "@typescript-eslint/consistent-type-imports": "error",

      "simple-import-sort/imports": "error",
      "simple-import-sort/exports": "error",
      "@typescript-eslint/unbound-method": "warn", // react-i18next typing issue
    },
  }
);
