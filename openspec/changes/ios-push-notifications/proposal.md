## Why

Канал `push` сейчас умеет только Web Push (VAPID): подписка браузера
`{endpoint, p256dh, auth}`. На iPhone он работает лишь в PWA на домашнем
экране. В iOS-приложении куратор и клиент общаются в чате, и без системных
уведомлений ответ куратора пропадает до следующего открытия приложения.
Обращения поддержки у куратора вообще обновляются вручную.

Уведомления несут только веб-путь (`actionUrl`, например
`/curator/clients/:id`). По нему приложение не может надёжно открыть нужный
экран, а для недельного отзыва в веб-пути нет даже id отчёта.

## What Changes

- Регистрация устройств iOS:
  - `POST /api/v1/notifications/devices` и `DELETE /api/v1/notifications/devices/:token`;
  - таблица `push_devices`: токен APNs, окружение sandbox или production,
    версия приложения, время последней активности.
- Отправка через APNs:
  - HTTP/2, авторизация ключом `.p8`, рядом с `SendDuePushes`;
  - канал `push` покрывает и браузеры, и iPhone пользователя;
  - недействительный токен (`410 Unregistered`, `400 BadDeviceToken`)
    отключает устройство.
- Адресация экрана: у уведомления появляется поле `target {kind, ids}`, оно
  же уходит в пуш. `actionUrl` остаётся для веба и писем.
- Действия и группировка в пуше:
  - категории `CHAT_MESSAGE` (ответ из уведомления), `TASK` («Выполнено» — кроме
    задач-тренировок, которым нужны тип и длительность; «Открыть»), `SUPPORT_ESCALATED`;
  - `thread-id` по переписке;
  - `badge` — сумма непрочитанного.
- Новое событие `chat_message`:
  - сообщение в чате пушится получателю, у которого нет открытого
    WebSocket-соединения;
  - строка в списке уведомлений не создаётся: у чата свой счётчик
    непрочитанного.
- Тихое время для iPhone: пуш не откладывается, а доставляется без звука и
  без включения экрана (`interruption-level: passive`). Для Web Push прежнее
  поведение — отложить.
- Фоновый пуш `content-available` без текста при изменении непрочитанного:
  обновляет значок, счётчики и виджеты, не чаще раза в минуту на устройство.
- Ответ при выключенном APNs: регистрация устройства возвращает `503
  feature_unavailable`, старт сервиса пишет предупреждение.

## Capabilities

### New Capabilities
- `push-devices`: регистрация, перенос и отключение устройств iOS.
- `notification-targets`: структурированная адресация экрана у уведомлений и пушей.
- `chat-message-push`: пуш о новом сообщении чата получателю без активного соединения.

### Modified Capabilities
- `notification-delivery`: добавляется доставка через APNs наравне с Web Push; доставка push разбивается на задания по адресатам; сообщение чата пушится без записи уведомления.
- `notification-preferences`: тихое время для iPhone приглушает пуш, а не откладывает; в матрицу добавляется тип `chat_message`.

## Impact

- `apps/api/internal/modules/notifications/delivery.go`:
  - `:11-25` — `Channel`;
  - `:72` — матрица каналов по типам, добавляется `chat_message`.
- `apps/api/internal/modules/notifications/push.go`:
  - `:125` — `SendDuePushes`, второй транспорт;
  - `:257-266` — отправка Web Push остаётся.
- `apps/api/internal/modules/notifications/apns.go` — новый отправитель (библиотека `github.com/sideshow/apns2`).
- `apps/api/internal/modules/notifications/types.go`:
  - `:39` — типы;
  - `:90` — `ActionURL`, рядом поле `Target`.
- Места создания уведомлений заполняют `target`:
  - `modules/curator/service.go:2451` — `feedback_received` с `report_id`;
  - задачи, планы, эскалации поддержки, заявки, экспорт.
- `apps/api/internal/modules/chat/` — после сохранения сообщения: проверка
  соединения через `shared/ws`, событие `chat_message`.
- `apps/api/internal/router/users.go:56-60` — маршруты `devices` рядом с `push`.
- `apps/api/internal/router/authorization_matrix_test.go` — `DELETE …/devices/:token` с защитой `owner`; `routes.golden`.
- `apps/api/internal/config/config.go:32-100` — возможность `apns` и переменные `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY`, `APNS_TOPIC`, `APNS_ENVIRONMENT`.
- Миграция:
  - таблица `push_devices`;
  - таблица `push_deliveries` — задание на каждый адресат (подписка браузера или устройство), статус `cancelled`;
  - колонка `notifications.target jsonb`;
  - номер выбирается по `schema_migrations` dev и прода.
- `apps/web/src/features/settings/` — колонка «Push» в настройках доставки подписана «Пуш (браузер и iPhone)».
- `docs/user-guide/` — уведомления на iPhone; `make sync-knowledge`.
