## 1. Токены для iOS

- [ ] 1.1 `build.mjs`: вывод `dist/ios/Colors.xcassets` и `dist/ios/Tokens.swift`; карта `outputs` (`:330`) и `--check`. Проверка: новые тесты в `scripts/__tests__/build.test.mjs` — роль в обеих темах, новая роль, отставание `dist/ios`; `npm run tokens:test`.
- [ ] 1.2 Коммит `dist/ios` вместе с источником. Проверка: `npm run tokens:check` зелёный на чистом клоне.

## 2. Каркас проекта

- [ ] 2.1 `apps/ios/project.yml`:
  - цели `Vzvesheno`, `VzveshenoWidgets`, пакет `VzveshenoKit`, тесты;
  - конфигурации Dev и Prod (bundle id, домен API, `aps-environment`, Associated Domains);
  - App Group и группа Keychain.

  Проверка: `xcodegen generate && xcodebuild build -scheme Vzvesheno-Dev`.
- [ ] 2.2 `.gitignore` для `*.xcodeproj`, DerivedData. Проверка: `git status` после генерации чистый.
- [ ] 2.3 SwiftLint с правилом `ds_color_literal`. Проверка: тестовый файл с литералом валит `swiftlint --strict`.

## 3. DesignSystem

- [ ] 3.1 Шрифты Literata и Golos Text (переменные, OFL), `DS.Typography` с `relativeTo`. Проверка: снапшот-тесты карточки на `.large` и `.accessibility5`.
- [ ] 3.2 Компоненты Card, CoachCard, ProgressArc, ProgressBar, MacroRemaining, WeekDots, QuickAdd, стили кнопок — по правилам `docs/design-system/README.md`. Проверка: снапшот-тесты каждого компонента в светлой и тёмной теме; тест MacroRemaining «91 из 140 г → 49 г осталось», «превышение со знаком +».
- [ ] 3.3 Справочник компонентов в Dev-сборке. Проверка: UI-тест открывает справочник и находит все компоненты.

## 4. API и сессия

- [ ] 4.1 `API`: конверт, ошибки по коду, совместные GET, `Accept-Language`. Проверка: юнит-тесты на `URLProtocol`-заглушке; тест полноты каталога строк по `codes.go`.
- [ ] 4.2 `SessionStore` (actor): Keychain, одно обновление на все ожидающие, `session_ended`. Проверка: тест «три запроса — один refresh»; тест атрибутов Keychain.
- [ ] 4.3 Выход, очистка и сброс Keychain после переустановки. Проверка: юнит-тесты сценариев `ios-session-storage`.

## 5. Оболочка, ссылки, конфигурация

- [ ] 5.1 Выбор оболочки по роли, экран «доступно в веб-версии», кэш профиля. Проверка: UI-тесты на заглушках `/auth/me` для четырёх ролей.
- [ ] 5.2 Проверка минимальной версии по `/config`. Проверка: юнит-тест сравнения версий и UI-тест блокирующего экрана.
- [ ] 5.3 `Router` для universal links, `target` и интентов; отложенная ссылка до входа. Проверка: таблица юнит-тестов «адрес → путь» на каждую строку `ios-deep-links`.

## 6. Офлайн

- [ ] 6.1 Кэш экранов — файлы JSON в App Group (см. design.md), очистка при выходе. Проверка: юнит-тест «кэш принадлежит пользователю».
- [ ] 6.2 `Outbox` в SQLite (App Group): порядок, повторы, откат при 4xx, кроме 401/408/429, ключ на изменение. Проверка: юнит-тесты сценариев `ios-offline-outbox` с имитацией обрыва после записи.

## 7. Бэкенд: Idempotency-Key

- [ ] 7.1 Номер миграции по `schema_migrations` dev и прода; таблица `idempotency_keys (user_id, key, method, path, body_hash, status, response, created_at)`, очистка старше 24 часов фоновой задачей. Проверка: тест мигратора; тест очистки.
- [ ] 7.2 `middleware/idempotency.go` на перечисленных маршрутах. Проверка: тесты трёх требований `idempotent-mutations`; `go test ./internal/router/` (golden не меняется — маршруты те же).

## 8. Требования платформы

- [ ] 8.1 `PrivacyInfo.xcprivacy` в приложении и расширении, `ITSAppUsesNonExemptEncryption`, фоновые режимы и `BGTaskSchedulerPermittedIdentifiers`, класс защиты и исключение из резервной копии для кэша, очереди и снимка, String Catalog с формами множественного числа. Проверка: скрипт CI проверяет манифест и `Info.plist` в собранных `.app` и `.appex`; юнит-тесты атрибутов файла и склонений; `performAccessibilityAudit()` на перечисленных экранах.
- [ ] 8.2 События только в `/public/analytics/events`, без сторонних SDK; ярлыки приватности App Store. Проверка: тест списка пакетов и `Info.plist`.

## 9. CI и документация

- [ ] 9.1 Задача `ios` в `ios.yml` (отдельный файл; `ci.yml` не меняется) с фильтром путей, кэшем SPM и DerivedData. Проверка: PR, меняющий только веб, не запускает задачу; PR с токенами — запускает и проходит.
- [ ] 9.2 `docs/design-system/README.md` — раздел «iOS»; `CLAUDE.md` — команды `xcodegen`, `xcodebuild test`, правило цветов для Swift. Проверка: ревью; `scripts/check-codebase-integrity.mjs` зелёный.
