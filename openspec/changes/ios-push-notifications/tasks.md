## 1. Данные

- [x] 1.1 Выбрать номер миграции по `schema_migrations` dev и прода. Проверка: номер указан в PR и больше максимального в обеих базах.
- [x] 1.2 Миграция:
  - таблица `push_devices` (переименование `apns_devices` из 095 с сохранением данных и `installation_id`): `token` уникальный, индекс по `user_id` (обычный — внешнему ключу нужен ведущий индекс);
  - `notifications.target jsonb NOT NULL DEFAULT '{"kind":"notifications"}'`;
  - таблица `push_deliveries` (задание на адресат: `notification_id` или `chat_message_id`, `transport`, `subscription_id`/`device_id`, статус с `cancelled`).

  Проверка: up/down на чистой базе в тесте мигратора.

## 2. Адрес экрана

- [x] 2.1 Тип `Target` и таблица «тип уведомления → вид адреса» в `modules/notifications/types.go`. Тест полноты по всем `NotificationType`. Проверка: тест падает, если убрать одну запись.
- [x] 2.2 Заполнение `target` во всех местах создания:
  - отзыв — `curator/service.go:2451`;
  - задачи, план, эскалация, заявка куратора, уход клиента, статья, экспорт.

  Проверка: тесты сервисов проверяют `target` у созданного уведомления.
- [x] 2.3 `GET /notifications` отдаёт `target`. Проверка: тест обработчика и обновлённый тип в `apps/web/src/features/notifications/types`; `npm run type-check`.

## 3. Устройства

- [x] 3.1 `POST /notifications/devices`, `DELETE /notifications/devices/:token` (`router/users.go`). Запись в `protectedRoutes` с защитой `owner`; `UPDATE_GOLDEN=1 go test ./internal/router/`. Проверка: `go test ./internal/router/` и тесты сценариев `push-devices` (перенос токена, чужой токен).
- [x] 3.2 Возможность `apns` в `config.Features` и переменные в `.env.example`. Проверка: тест «без ключа → 503 `feature_unavailable`», `/config` и `/ready` отдают `features.apns: false`.

## 4. Отправка

- [x] 4.1 `apns.go`: свой HTTP/2-клиент (из 095) с хостом по окружению устройства, построение нагрузки (`alert`, `thread-id`, `category`, `badge`, `target`, `notification_id`, `interruption-level`). Проверка: юнит-тест нагрузки на каждый вид `target`; тест «нет почты и значений дневника в нагрузке».
- [x] 4.2 `SendDuePushes` (`push.go:125`) работает по `push_deliveries`: задание на каждую подписку и устройство, повтор только неудавшихся, сводный статус в `notification_deliveries`; `410` и `BadDeviceToken` отключают устройство. Проверка: тест с фальшивым HTTP/2-сервером APNs (`httptest` с `EnableHTTP2` и TLS, подменённые хосты).
- [x] 4.3 Тихое время: для iOS — `passive` без звука, для Web Push — отложить. Проверка: тест для обоих транспортов в тихий интервал.
- [x] 4.4 Значок: `main` + непрочитанные сообщения чата. Проверка: тест сценария «две статьи и одно сообщение».
- [x] 4.5 Фоновый пуш `content-available` при изменении непрочитанного, не чаще раза в минуту на устройство. Проверка: тест сценария «Прочитано в вебе» и тест ограничения частоты.
- [x] 4.6 Частичный сбой: тест «Web Push доставлен, APNs `503` — повторяется только APNs».

## 5. Пуш о сообщениях чата

- [x] 5.1 Интерфейс `Presence` над хабом `shared/ws` (`IsConnected(userID)`). Проверка: юнит-тест хаба.
- [x] 5.2 После сохранения сообщения (`modules/chat/service.go`) — задание `chat_message`, если получатель не подключён и push разрешён. Проверка: тесты трёх сценариев `chat-message-push`.
- [x] 5.3 Отмена перед отправкой, если переписка прочитана. Проверка: тест «прочитал в вебе до отправки».
- [x] 5.3a Настройка «Показывать текст сообщений» (по умолчанию включена) в `delivery-preferences`, тело пуша по ней. Проверка: тесты двух сценариев.
- [x] 5.4 Тип `chat_message` в матрице предпочтений, только push. Проверка: тест `GET delivery-preferences`; веб-таблица настроек показывает строку «Сообщения чата» без почты — тест `NotificationDeliverySettings`.

## 6. Документация и выкат

- [x] 6.1 Подпись колонки «Пуш (браузер и iPhone)» в вебе, `docs/user-guide/` — уведомления на iPhone; `make sync-knowledge`. Проверка: `TestKnowledgeMatchesUserGuide`, `npm run lint:web`.
- [ ] 6.2 Ключ «Weighted» (Key ID `743P3Y36VM`) в секретах Dokploy, `APNS_TOPIC=team.burcev.app.dev` на dev и `team.burcev.app` на проде, выкат на dev. Проверка: сборка из Xcode на устройстве получает пуш о сообщении куратора и открывает переписку по тапу.
