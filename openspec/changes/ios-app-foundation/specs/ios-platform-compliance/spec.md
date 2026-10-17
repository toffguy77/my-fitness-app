## ADDED Requirements

### Requirement: Манифест приватности и декларации сборки

Приложение и расширение SHALL содержать `PrivacyInfo.xcprivacy` с причинами использования API из списка Apple (`UserDefaults`, метки времени файлов, свободное место) и типами собираемых данных (здоровье и фитнес, фото, контакты — адрес почты); `Info.plist` MUST содержать `ITSAppUsesNonExemptEncryption = false`. Сборка MUST падать, если манифест отсутствует в цели.

#### Scenario: Проверка сборки

- **WHEN** скрипт CI проверяет собранный `.app` и `.appex`
- **THEN** в каждом найден `PrivacyInfo.xcprivacy` с ключом `NSPrivacyAccessedAPITypes`

### Requirement: Данные о здоровье защищены на устройстве

Кэш экранов, очередь изменений и снимок дня SHALL храниться с классом защиты `completeUntilFirstUserAuthentication` (доступны фоновой доставке и расширению после первой разблокировки) и MUST быть исключены из резервной копии iCloud (`isExcludedFromBackup`).

#### Scenario: Атрибуты файла очереди

- **WHEN** юнит-тест создаёт файл очереди в App Group
- **THEN** у файла класс защиты `completeUntilFirstUserAuthentication` и `isExcludedFromBackup = true`

### Requirement: Фоновые режимы объявлены

`Info.plist` приложения SHALL объявлять фоновые режимы `remote-notification` и `fetch`, идентификатор `BGTaskSchedulerPermittedIdentifiers` для досылки очереди и entitlement фоновой доставки HealthKit.

#### Scenario: Проверка Info.plist

- **WHEN** тест читает собранный `Info.plist`
- **THEN** в `UIBackgroundModes` есть `remote-notification` и `fetch`, в `BGTaskSchedulerPermittedIdentifiers` — идентификатор очереди

### Requirement: Числа со словами склоняются

Строки с числами («N дней», «N мин назад», «Добавить N позиций», «N стаканов», «Ранее (N дн.)») SHALL храниться в String Catalog с формами `one`, `few`, `many`, `other` для русского.

#### Scenario: 1, 2, 5 и 21 день

- **WHEN** тест форматирует «ждёт N дней» для 1, 2, 5 и 21
- **THEN** получено «ждёт 1 день», «ждёт 2 дня», «ждёт 5 дней», «ждёт 21 день»

### Requirement: Главные экраны проходят аудит доступности

Экраны «Сегодня», «Дневник», «Записать еду», «Куратор», «Клиенты», карточка клиента и переписка куратора SHALL проходить `performAccessibilityAudit()` без ошибок; у дуг, полос и графиков MUST быть текстовые описания значений, а анимации MUST отключаться при «Уменьшении движения».

#### Scenario: Дуга остатка в VoiceOver

- **WHEN** VoiceOver фокусируется на дуге карточки «Питание»
- **THEN** озвучивается «Съедено 549 из 2 472 килокалорий»

### Requirement: Аналитика без сторонних SDK

Приложение SHALL отправлять события только в `POST /api/v1/public/analytics/events` и MUST NOT включать сторонние SDK аналитики, рекламы или атрибуции; `NSUserTrackingUsageDescription` MUST отсутствовать.

#### Scenario: Проверка зависимостей

- **WHEN** тест CI перечисляет пакеты SPM приложения
- **THEN** среди них нет пакетов из списка запрещённых (AppMetrica, Firebase Analytics, Adjust, AppsFlyer), а в `Info.plist` нет `NSUserTrackingUsageDescription`
