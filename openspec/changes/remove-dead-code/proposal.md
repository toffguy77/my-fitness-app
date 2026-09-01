## Why

В кодовой базе есть фрагменты, которые выглядят работающими, но не работают. Это дороже обычного мусора: они вводят в заблуждение при ревью, попадают в оценки покрытия и создают ложное чувство готовности.

- **Модуль `nutrition` — полная заглушка.** `apps/api/internal/modules/nutrition/service.go:39-125` — пять методов возвращают захардкоженные данные («Oatmeal, 150 ккал») с комментариями `TODO: Implement Supabase query`. При этом роуты `/api/v1/nutrition/entries` зарегистрированы под аутентификацией (`cmd/server/main.go:307-311`) и доступны в проде. Реальный трекинг питания живёт в модуле `food-tracker`.
- **Два конфига Next.js.** В корне репозитория лежит `next.config.ts` с `reactCompiler: true`, рабочий — `apps/web/next.config.ts` с `reactCompiler: false` и комментарием «babel-plugin-react-compiler not installed», хотя пакет присутствует в `devDependencies`. `CLAUDE.md` утверждает, что React Compiler включён. Три источника истины, все расходятся. Рядом в корне — осиротевшие `jest.config.js`, `postcss.config.mjs`, `next-env.d.ts`, `tsconfig.tsbuildinfo`.
- **Дублирование WebSocket-клиента.** `apps/web/src/features/chat/components/WebSocketProvider.tsx` и `apps/web/src/features/chat/hooks/useWebSocket.ts` — две почти идентичные реализации подключения, переподключения и обработки событий.
- **Мёртвые фича-флаги.** `NEXT_PUBLIC_ENABLE_OCR`, `NEXT_PUBLIC_ENABLE_PREMIUM`, `NEXT_PUBLIC_ENABLE_CHAT` объявлены в закоммиченном `apps/web/.env.local`, но не читаются нигде в коде. `NEXT_PUBLIC_SENTRY_DSN` и `NEXT_PUBLIC_GA_ID` объявлены без установленных библиотек.
- **Опасное имя переменной.** `NEXT_PUBLIC_OPENROUTER_API_KEY` — префикс `NEXT_PUBLIC_` означает попадание значения в браузерный бандл. Сейчас переменная пуста, но само её присутствие приглашает заполнить.

## What Changes

- **BREAKING (публичный API):** удаляются роуты `/api/v1/nutrition/*` и модуль `apps/api/internal/modules/nutrition` целиком.
- Удаляются осиротевшие корневые файлы конфигурации Next.js и связанные артефакты сборки; корневой `tsconfig.json` остаётся только если используется workspace-инструментами.
- `apps/web/next.config.ts` приводится в согласие с реальностью: React Compiler включается (пакет установлен) либо флаг и комментарий удаляются как несоответствующие; `CLAUDE.md` приводится к фактическому состоянию.
- WebSocket-клиент сводится к одной реализации; вторая удаляется, все потребители переключаются.
- Мёртвые фича-флаги удаляются из `apps/web/.env.local`; `NEXT_PUBLIC_OPENROUTER_API_KEY` удаляется как класс ошибки.
- Вводится проверка в CI: переменные с префиксом `NEXT_PUBLIC_`, не читаемые кодом, и `TODO`-заглушки в зарегистрированных обработчиках ломают сборку.

## Capabilities

### New Capabilities

- `codebase-integrity`: правила, запрещающие держать в кодовой базе зарегистрированные, но не реализованные эндпоинты, дублирующиеся конфигурации и объявленные, но не используемые публичные переменные окружения.

### Modified Capabilities

<!-- Существующих спеков нет -->

## Impact

**Бэкенд:**
- Удаляются `apps/api/internal/modules/nutrition/` (включая `service.go`, `handler.go`, тесты).
- `apps/api/cmd/server/main.go:302-312` — снятие регистрации группы `/nutrition`.

**Фронтенд:**
- Удаляются корневые `next.config.ts`, `jest.config.js`, `jest.setup.js`, `postcss.config.mjs`, `next-env.d.ts`, `tsconfig.tsbuildinfo`.
- `apps/web/next.config.ts:11` — решение по `reactCompiler`.
- Удаляется одна из двух реализаций: `features/chat/components/WebSocketProvider.tsx` либо `features/chat/hooks/useWebSocket.ts`.
- `apps/web/.env.local` — чистка флагов.

**Документация:**
- `CLAUDE.md` — раздел «Key Technical Details»: убрать утверждение про включённый React Compiler, если он выключен; убрать модуль `nutrition` из списка модулей.

**CI:**
- `.github/workflows/ci.yml` — новый шаг проверки целостности.

**Зависимости:** возможно удаление `babel-plugin-react-compiler`, если React Compiler решено не включать.

**Порядок:** мержить после `fix-authorization-gaps` (обе правки затрагивают регистрацию роутов).
