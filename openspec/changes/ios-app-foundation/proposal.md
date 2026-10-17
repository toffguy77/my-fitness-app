## Why

У «Взвешено» есть дизайн-система в коде (`packages/design-tokens`), и веб на
неё переведён. Мобильных приложений пока нет. `dist/tokens.json` собирается
«для будущих iOS/Android», но его никто не читает.

Прежде чем делать экраны клиента и куратора (`ios-client-app`,
`ios-curator-app`), нужен общий фундамент. Без него каждый экран будет решать
одни и те же вопросы по-своему:
- откуда берутся цвета;
- как хранится сессия;
- как показываются ошибки;
- что происходит без сети;
- как ссылка из письма открывает нужный экран.

## What Changes

- **Проект `apps/ios`.**
  - SwiftUI, минимальная iOS 18, проект собирается XcodeGen из `project.yml`.
  - Цели: приложение, расширение виджетов, локальный Swift-пакет `VzveshenoKit`
    (модули `DesignSystem`, `API`, `Session`, `Outbox`, `Navigation`), тесты.
  - Конфигурации dev (`new.burcev.team`) и prod (`burcev.team`) с разными
    bundle id.
- **Токены дизайн-системы для Swift.**
  - Сборка токенов дополнительно выпускает `dist/ios/Tokens.swift` и каталог
    цветов `dist/ios/Colors.xcassets` (светлый и тёмный вариант каждой роли).
  - `tokens:check` следит, чтобы они не отставали.
  - Шрифты Literata и Golos Text встраиваются и масштабируются с Dynamic Type.
- **Компоненты SwiftUI** — те же роли, что в `apps/web/src/shared/components/ui`:
  Card, CoachCard, ProgressArc, ProgressBar, MacroRemaining, WeekDots,
  QuickAdd, кнопки. В отладочной сборке есть справочник компонентов.
- **Клиент API.**
  - `async/await`, разбор конверта `{status, data, code, params}`.
  - Тексты ошибок берутся по `code`, а не по `message`.
  - Одно обновление сессии на все параллельные запросы.
  - Совместное ожидание одинаковых GET.
  - `Accept-Language` по языку профиля, по умолчанию `ru`.
- **Сессия в Keychain.**
  - Доступ `AfterFirstUnlockThisDeviceOnly`, общая группа с расширением виджетов.
  - Нативные эндпоинты из `ios-native-session`.
- **Оболочка по роли** из `GET /auth/me`. Пока роль неизвестна, оболочка не
  рисуется. Минимальная версия из `GET /config` блокирует устаревшее
  приложение экраном «Обновите приложение».
- **Офлайн.**
  - Кэш последних ответов экранов на устройстве.
  - Очередь изменений, которая переживает перезапуск и досылает изменения
    при появлении сети.
  - Повтор безопасен: сервер принимает заголовок `Idempotency-Key`.
- **Бэкенд: `Idempotency-Key`** для записи еды, воды, метрик дня, сообщений
  чата и отметки задач. Повтор с тем же ключом в течение суток возвращает
  первый ответ, а не создаёт вторую запись.
- **Маршрутизация ссылок.** Universal links и `target` пуша открывают экран
  через один маршрутизатор.
- **CI.** Задача `iOS` в GitHub Actions на macOS: сборка и тесты при
  изменениях в `apps/ios/**` и `packages/design-tokens/**`. В обязательные
  проверки она не входит, пока приложение не в App Store.

## Capabilities

### New Capabilities
- `ios-design-tokens`: Swift-представление токенов, каталог цветов, шрифты и Dynamic Type, проверка отставания.
- `ios-api-client`: обращение к API, разбор ответа, ошибки по коду, обновление сессии, совместные GET.
- `ios-session-storage`: хранение и жизненный цикл сессии на устройстве.
- `ios-role-shell`: выбор интерфейса по роли и проверка минимальной версии.
- `ios-offline-outbox`: кэш экранов и очередь изменений без сети.
- `idempotent-mutations`: серверная поддержка `Idempotency-Key` для изменяющих запросов приложения.
- `ios-deep-links`: открытие экранов по universal link и адресу пуша.
- `ios-ci`: сборка и тесты приложения в CI.
- `ios-platform-compliance`: манифест приватности, защита данных на устройстве, фоновые режимы, склонение чисел, доступность.

### Modified Capabilities
<!-- нет: веб-поведение не меняется -->

## Impact

- **Новое:** `apps/ios/` — `project.yml`, `Vzvesheno/`, `VzveshenoWidgets/`, `VzveshenoKit/`, `Tests/`.
- **Сборка токенов** `packages/design-tokens/scripts/build.mjs`:
  - `:13` — упоминание `tokens.json` для мобильных;
  - `:330` — карта `outputs` дополняется `dist/ios/*`;
  - `scripts/__tests__/build.test.mjs` — проверки нового вывода.
- **Бэкенд:**
  - `apps/api/internal/shared/middleware/` — новый `idempotency.go`;
  - миграция `idempotency_keys` (номер по `schema_migrations`);
  - подключение на маршрутах:
    - `router/tracker.go:61` (`POST /daily`) и записи еды, воды;
    - `POST /dashboard/tasks/:id/complete`;
    - `POST /conversations/:id/messages`.
- **CI** `.github/workflows/ci.yml` — новая задача `ios` с фильтром путей. Имена обязательных проверок (`CI Pipeline` и др.) не меняются.
- **Документация:**
  - `docs/design-system/README.md` — раздел «iOS»;
  - `CLAUDE.md` — команды сборки iOS и правило «значения — только в токенах» для Swift.
