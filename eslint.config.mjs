// eslint.config.js
import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import globals from "globals";

export default [
  js.configs.recommended,
  
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.es2021,
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      "@typescript-eslint/explicit-function-return-type": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { 
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "no-unused-vars": "off", // Turn off base rule as it conflicts with @typescript-eslint/no-unused-vars
      "no-console": [
        "warn",
        { allow: ["warn", "error"] },
      ],
      "no-undef": "off", // TypeScript handles this
    },
  },
  
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "examples/**",
      "*.config.js",
      "jest.config.js",
    ],
  },
];