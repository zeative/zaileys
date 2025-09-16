const eslint = require("@eslint/js");
const tseslint = require("typescript-eslint");

module.exports = tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      "semi": ["error", "always"],
      "quotes": ["error", "double"]
    },
  },
  {
    ignores: ["dist/", "sessions/", "node_modules/"]
  }
);