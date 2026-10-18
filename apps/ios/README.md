# «Взвешено» для iPhone

SwiftUI, iOS 18+, Swift 6 со строгой проверкой параллельности. Проект
собирает XcodeGen из `project.yml`; `Vzvesheno.xcodeproj`, `Info.plist`,
`.entitlements` и `BuildNumber.xcconfig` генерируются и в git не хранятся.
Требования — `openspec/changes/ios-app-foundation` и следующие iOS-изменения,
план работ — `docs/ios/IMPLEMENTATION.md`.

## Устройство

| Путь | Что |
|---|---|
| `Vzvesheno/` | приложение: запуск, модель (`AppModel`), вход, онбординг, «Сегодня», «Записать еду» (`FoodLogging/`), «Дневник», «Меню», профиль, оболочки по роли |
| `VzveshenoWidgets/` | расширение виджетов (каркас; виджеты — `ios-system-surfaces`) |
| `VzveshenoKit/` | локальный Swift-пакет: `DesignSystem`, `API`, `Session`, `Outbox`, `Navigation`, `Health`, `Client` и их тесты |
| `VzveshenoTests/` | тесты внутри приложения: манифест, Info.plist, Keychain, модель, снапшоты экранов с макетами |
| `VzveshenoUITests/` | UI-тесты: оболочки ролей, «Обновите приложение», справочник, аудит доступности |
| `_legacy/` | приложение 0.3.x (`Burcev`) — источник для переноса экранов; ни в одну цель не входит |
| `fastlane/`, `scripts/` | выкладка, скриншоты, проверки сборки |

Ядро модулей `VzveshenoKit` — только Foundation: клиент API, сессия, очередь
изменений, маршрутизатор, модели компонентов, модели экранов клиента
(`Client`: «Сегодня», онбординг, запись еды, «Дневник», нутриенты,
«Меню» — числа сверяются с вебом на общих фикстурах `docs/ios/fixtures/`;
задержки поиска и окна отмены — через `Sleeper`, тесты гоняют их
виртуальным временем). Keychain, SwiftUI, Network,
BackgroundTasks, WidgetKit и HealthKit — адаптеры под `#if canImport(...)`. Токены
дизайн-системы подключены ссылкой
`VzveshenoKit/Sources/DesignSystem/Generated → packages/design-tokens/dist/ios`
(не копия): правка токена и `npm run tokens:build` сразу доходят до приложения.

## Схемы и среды

| Схема | Конфигурации | API | Bundle id | Push |
|---|---|---|---|---|
| `Vzvesheno-Dev` | `Dev-Debug`, `Dev-Release` | https://new.burcev.team | `team.burcev.app.dev` (+ `.widget`) | development |
| `Vzvesheno-Prod` | `Prod-Debug`, `Prod-Release` | https://burcev.team | `team.burcev.app` (+ `.widget`) | production |

App Group `group.team.burcev.app[.dev]`, группа Keychain
`3GWRDGA8B7.team.burcev.app[.dev].shared` (общая с виджетами), Associated
Domains `applinks:` и `webcredentials:` своего домена. Справочник
компонентов и сценарии UI-тестов (`-uiTestScenario client|coordinator|…`) —
только в Dev и отладочных сборках.

Версия — `MARKETING_VERSION` в `project.yml` (1.0.0). Номер сборки — число
коммитов (`scripts/build-number.sh`, вызывается XcodeGen); руками не правится.

## Проверки без Mac

Своего Mac нет. На Linux в Docker проверяется всё, что не требует платформ Apple:

```bash
# Тесты ядра VzveshenoKit (нужен libsqlite3-dev: образ из swift:6.2-noble + apt).
# Монтируется весь репозиторий: Generated ведёт в packages/design-tokens,
# тесты сверяются с apps/api (каталог кодов ошибок).
docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp -v "$PWD":/repo \
  -w /repo/apps/ios/VzveshenoKit swift-sqlite:6.2 swift test

# SwiftLint, как в CI.
docker run --rm -v "$PWD/apps/ios":/work -w /work ghcr.io/realm/swiftlint:latest lint --strict
```

Образ `swift-sqlite:6.2`:
`printf 'FROM swift:6.2-noble\nRUN apt-get update && apt-get install -y libsqlite3-dev pkg-config\n' | docker build -t swift-sqlite:6.2 -`.

Компиляция для iOS, снапшоты и UI-тесты — только в CI: `.github/workflows/ios.yml`
(задача `ios`, macOS 15, Xcode 26.3, iPhone 16 Pro с iOS 18.5).

На Mac:

```bash
cd apps/ios
xcodegen generate
swiftlint --strict
xcodebuild test -scheme Vzvesheno-Dev -destination 'platform=iOS Simulator,name=iPhone 16 Pro,OS=18.5'
```

### Снапшоты

Эталоны компонентов — `VzveshenoKit/Tests/DesignSystemTests/__Snapshots__/*.png`,
экранов — `VzveshenoTests/__Snapshots__/*.png` (экран в окне приложения 390 ×
844 pt, как макеты: так рисуются и поля ввода, и кнопка Apple). Нет
эталона — на Mac тест записывает его и падает; при расхождении рядом
кладётся `*.actual.png`. В CI (`TEST_RUNNER_CI`) снимок без эталона ложится
рядом как `*.new.png`, и тест падает при каждом повторе: иначе повтор нашёл
бы только что записанный эталон и прогон стал бы зелёным с эталоном, которого
нет в git. CI всегда выкладывает каталог артефактом `ios-snapshots`:

```bash
gh run download <id> -n ios-snapshots -D /tmp/snap
# просмотреть *.new.png, переименовать без .new (*.actual.png — не эталоны)
# и закоммитить в __Snapshots__
```

Перезаписать все эталоны: `TEST_RUNNER_SNAPSHOT_RECORD=1 xcodebuild test …`.

## Цвета

Только роли `DS.Color.*` из `packages/design-tokens`. Правило SwiftLint
`ds_color_literal` запрещает `Color(red:…)`, `Color(hex:)`, `UIColor(red:…)`,
`#colorLiteral` и строки `"#RRGGBB"` вне `DesignSystem`;
`scripts/check-color-rule.sh` в CI проверяет, что правило всё ещё срабатывает.

## Выкладка

Подпись — **ручная**: сертификат Apple Distribution и профиль App Store, который
fastlane выпускает ключом App Store Connect API (`get_provisioning_profile`).
Автоматическая подпись Xcode на каждом чистом раннере выпускала новый
сертификат разработчика и упиралась в лимит аккаунта.

| Lane | Что делает |
|---|---|
| `beta` | сертификат во временную связку, `build`, проверка entitlements и манифеста, `validate`, загрузка altool с ожиданием обработки, dSYM в Sentry. `ci_beta` — прежнее имя |
| `build` | идентификаторы и возможности (HealthKit, Associated Domains, Push, Sign in with Apple, App Groups), профили, IPA схемы среды |
| `validate` | `altool --validate-app` — те же правила, что приём в App Store Connect |
| `upload_direct` | загрузка с `--build-status`: отказ Apple при обработке виден сразу |
| `metadata` | тексты и скриншоты страницы App Store по одному полю |
| `status`, `distribute_internal` | состояние сборок; внутренняя группа «Команда» |

Среда — переменная `APP_ENV` (`dev` или `prod`, по умолчанию прод).
Запуск в CI: тег `ios-v*` (`ios-testflight.yml`, поле `environment` у ручного
запуска), `ios-meta-*` — страница App Store, `ios-status-*` — состояние.
Секреты GitHub кладёт `scripts/set-github-secrets.sh` (запускает человек).

App ID `.dev`, App Groups и запись приложения в App Store Connect заводятся в
портале Apple человеком; lane включает возможности, но привязку App Group к
идентификатору, если её нет, делают в Certificates, Identifiers & Profiles.

## Сбои и аналитика

Sentry — единственный сторонний пакет, только отчёты о сбоях: без трассировки,
сетевых крошек и снимков экрана. События продукта — только
`POST /api/v1/public/analytics/events` (`AnalyticsClient`), без сторонних SDK и
без запроса App Tracking Transparency.
