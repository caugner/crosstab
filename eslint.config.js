import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    files: ["background.js", "view/**/*.js"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.webextensions },
    },
  },
  {
    files: ["scripts/**/*.js", "listing/**/*.js"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["scripts/screenshots.js"],
    // Some functions are passed to and run in the Crosstab page.
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
        ...globals.webextensions,
      },
    },
  },
  {
    files: ["background.js"],
    languageOptions: { sourceType: "script" },
  },
];
