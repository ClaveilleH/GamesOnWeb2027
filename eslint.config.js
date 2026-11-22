import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["dist/", "playwright-report/", "test-results/"] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.browser,
    },
  },
  {
    // Les tests et la configuration tournent sous Node ; les rappels de page.evaluate, dans la page.
    files: ["tests/**/*.js", "*.config.js"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
];
