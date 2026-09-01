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
    "coverage/**",
    "e2e/**",
    "scripts/**", // Ignore scripts directory
  ]),
  {
    files: ["**/__tests__/**", "**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}", "**/error-handling.test.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-require-imports": "warn",
      "@typescript-eslint/ban-ts-comment": "off", // Allow @ts-nocheck in test files
      "react-hooks/exhaustive-deps": "off",
      "react-hooks/rules-of-hooks": "warn",
    },
  },
  {
    files: ["**/DateInput.tsx", "**/InstallPrompt.tsx", "**/OfflineIndicator.tsx"],
    rules: {
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    // Отключаем ошибки React Compiler для файлов с синхронным setState в useEffect
    // Это валидные случаи инициализации состояния из внешних систем
    files: ["**/DateInput.tsx", "**/InstallPrompt.tsx", "**/OfflineIndicator.tsx"],
    rules: {
      "@next/next/no-img-element": "off",
    },
  },
  {
    rules: {
      "react/display-name": "warn",
      "react-hooks/exhaustive-deps": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "react/no-unescaped-entities": "off",
    },
  },
  {
    // Security rules, merged in from the former eslint.security.config.mjs.
    //
    // That file ran as a separate CI step with the default parser, which cannot
    // read TypeScript or JSX: all ~280 of its findings were parse errors, so it
    // had never inspected a line. It also carried continue-on-error, so the
    // failure was invisible. Rather than keep a second, differently-broken
    // linter pass, its rules live here and run with the real parser.
    rules: {
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-script-url": "error",
      "no-debugger": "error",
      // no-alert also covers confirm() and prompt(). The five current uses are
      // confirmations before destructive actions, not XSS vectors, so this is a
      // UX debt rather than a security defect: replacing them needs a reusable
      // dialog component. Kept visible as a warning.
      "no-alert": "warn",
    },
  },
  {
    // React Compiler rules, blocking.
    //
    // They were briefly at "warn": ESLint had been crashing on startup (an ajv
    // 8 override reaching the config loader, which uses the ajv 6 API), so the
    // twenty violations these found surfaced all at once when it was fixed.
    // They are now fixed — data loading moved inside its effects, the food
    // entry modal resets by remounting rather than by correcting itself after
    // a render — and the rules block again, because with React Compiler
    // enabled an immutability or memoization violation changes behaviour.
    rules: {
      "react-hooks/set-state-in-effect": "error",
      "react-hooks/immutability": "error",
      "react-hooks/preserve-manual-memoization": "error",
      "react-hooks/refs": "error",
    },
  },
]);

export default eslintConfig;
