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
    // Послабления для тестов.
    //
    // Здесь было ещё два: `no-explicit-any` и `exhaustive-deps` выключались для
    // тестов и не выключались — общий блок ниже включает их обратно для всех
    // файлов, потому что идёт после этого. Отсюда и брались 248 предупреждений
    // про `any` в тестах при конфигурации, которая их будто бы разрешает.
    // Строки убраны, а не перенесены ниже: `any` в тесте выключает ровно ту
    // проверку типов, ради которой тест написан.
    files: ["**/__tests__/**", "**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}", "**/error-handling.test.tsx"],
    rules: {
      "@typescript-eslint/no-require-imports": "warn",
      "@typescript-eslint/ban-ts-comment": "off", // Allow @ts-nocheck in test files
      "react-hooks/rules-of-hooks": "warn",
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
      // no-alert также покрывает confirm() и prompt(). Правило держали
      // предупреждением, пока подтверждения перед необратимыми действиями
      // спрашивались браузерным окном: заменить их было нечем. Теперь есть
      // ConfirmDialog, в коде не осталось ни одного вызова, и правило
      // закрывает путь назад, а не напоминает о долге.
      "no-alert": "error",
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
  {
    // Дизайн-система: в интерфейсе только роли (docs/design-system/README.md).
    //
    // До неё в 201 файле жили 3 037 классов палитры (gray-500, blue-600…) и
    // десятки шестнадцатеричных цветов в графиках: один и тот же «серый
    // текст» был пятью разными серыми, а тёмная тема была невозможна. Палитра
    // Tailwind отключена в теме, так что такой класс просто не сработает —
    // правило говорит об этом сразу и называет роль, которой его заменить.
    // Перевод старых классов: apps/web/scripts/design-system-codemod.mjs.
    files: ["apps/web/src/**/*.{ts,tsx}"],
    ignores: ["**/__tests__/**", "**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}", "**/testing/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/(^|[\\s:'\"`])(bg|text|border|border-[trblxy]|ring|ring-offset|fill|stroke|from|via|to|divide|outline|placeholder|accent|decoration|caret|shadow)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(50|[1-9]00|950)\\b/]",
          message: "Класс палитры Tailwind вместо роли дизайн-системы. Используйте роль: bg-surface, text-fg-muted, border-line, bg-primary, text-danger-fg… (docs/design-system/README.md).",
        },
        {
          selector: "TemplateElement[value.raw=/(^|[\\s:])(bg|text|border|border-[trblxy]|ring|ring-offset|fill|stroke|from|via|to|divide|outline|placeholder|accent|decoration|caret|shadow)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(50|[1-9]00|950)\\b/]",
          message: "Класс палитры Tailwind вместо роли дизайн-системы. Используйте роль: bg-surface, text-fg-muted, border-line, bg-primary, text-danger-fg… (docs/design-system/README.md).",
        },
        {
          selector: "Literal[value=/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/]",
          message: "Цвет литералом. Возьмите роль из @burcev/design-tokens: color.* (CSS-переменная, переключается с темой) или values.light/dark там, где переменных нет.",
        },
      ],
    },
  },
]);

export default eslintConfig;
