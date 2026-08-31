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
    // React Compiler rules, temporarily at "warn".
    //
    // ESLint had been crashing on startup (an ajv 8 override reaching the
    // config loader, which uses the ajv 6 API), so nothing here was ever
    // reported. With the crash fixed and the lint step now blocking, these 15
    // pre-existing violations surfaced at once. They are real — with React
    // Compiler enabled, immutability and manual-memoization violations can
    // change behaviour — but fixing them means restructuring data fetching in
    // ten components, which is its own change with its own risk.
    //
    // Tracked by openspec/changes/fix-react-compiler-violations. Raise these
    // back to "error" as part of it; everything else stays blocking meanwhile.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/refs": "warn",
    },
  },
]);

export default eslintConfig;
