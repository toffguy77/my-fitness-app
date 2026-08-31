## Why

ESLint не работал: override `ajv` до версии 8 доходил до загрузчика конфигурации ESLint, который использует API ajv 6, и линтер падал при запуске с `TypeError: Cannot set properties of undefined (setting 'defaultMeta')`. Шаг в CI при этом существовал, поэтому создавалось впечатление, что код проверяется.

После починки запуска и перевода шага в блокирующий разом всплыли 15 накопленных нарушений правил React Compiler в десяти компонентах:

- `react-hooks/set-state-in-effect` (9) — синхронный `setState` в начале эффекта вызывает каскадный ререндер: `app/reset-password/page.tsx`, `features/auth/components/VerifyEmailScreen.tsx`, `features/content/components/{ArticleList,FeedList}.tsx`, `features/dashboard/components/ClientTasksSection.tsx`, `features/food-tracker/components/{FoodEntryModal,SearchTab}.tsx`, `features/settings/hooks/useSettings.ts`
- `react-hooks/immutability` (3) — мутация значений, которые компилятор считает неизменяемыми: `app/reset-password/page.tsx`, `features/dashboard/components/ClientTasksSection.tsx`, `features/food-tracker/hooks/useFoodSearch.ts`
- `react-hooks/preserve-manual-memoization` (2) — ручная мемоизация, которую компилятор не может сохранить: `features/dashboard/components/ClientTasksSection.tsx`, `features/food-tracker/hooks/useFoodSearch.ts`
- `react-hooks/refs` (1) — некорректная работа с ref: `features/notifications/components/NotificationDropdown.tsx`

Это перестало быть стилистикой: React Compiler включён в изменении `remove-dead-code`, и нарушения неизменяемости и ручной мемоизации способны изменить поведение скомпилированного кода.

Правила временно переведены в предупреждения с комментарием, ссылающимся на это изменение. Пока они не подняты обратно до ошибок, новые такие нарушения не блокируются.

## What Changes

- Устраняются все 15 нарушений: перестраивается сброс состояния при смене зависимостей в компонентах со списками и поиском, убираются мутации и ручная мемоизация, конфликтующие с компилятором.
- Четыре правила возвращаются в режим `error` в `eslint.config.mjs`, комментарий-заглушка удаляется.
- Добавляется проверка, что поведение затронутых экранов не изменилось.

## Capabilities

### New Capabilities

- `react-compiler-compliance`: требование к коду фронтенда соответствовать правилам React Compiler и блокирующий статус этих правил.

### Modified Capabilities

<!-- Существующих спеков нет -->

## Impact

**Фронтенд:** десять перечисленных выше файлов и `eslint.config.mjs`.

**Зависимостей и схемы БД не затрагивает.**

**Порядок:** после `frontend-resilience` и `ci-quality-gates` (там починен запуск ESLint и шаг сделан блокирующим).
