## 1. Схема разговора

- [x] 1.1 Добавить миграцию: `channel` со значением по умолчанию `telegram`, снятие `NOT NULL` с `chat_id`, `web_token_hash`, ограничение «ровно один идентификатор». Проверка: тесты сценариев «Разговор из Telegram», «Разговор из браузера», «Разговор без идентификатора не создаётся» (`TestConversationRequiresExactlyOneIdentity`, `TestConversationChannelMustBeKnown`) — `go test -tags=integration ./internal/modules/support/` зелёный, миграция 076 реально применена на dev (`web-app-db-dev`) при подъёме стенда для задачи 10.
- [ ] 1.2 Проверить применение миграции на копии боевых данных. Проверка: тест сценария «Существующие разговоры сохраняют канал» (`TestExistingConversationsBecomeTelegram`) проходит — но на dev-базе, не на копии боевых данных: этой копии в задаче 10 не поднимали. Числа строк до/после не сверялись отдельно.
- [x] 1.3 Написать откатную миграцию, явно удаляющую веб-разговоры перед возвратом `NOT NULL`. Проверка: `TestChannelMigrationDownKeepsTelegramConversations` — `go test -tags=integration ./internal/modules/support/` зелёный.

## 2. Сервис поддержки

- [x] 2.1 Развести создание разговора по каналам в `conversationFor`. Проверка: `go test ./internal/modules/support/` зелёный (сценарии начала/продолжения разговора — service_test.go, web_integration_test.go).
- [x] 2.2 Сделать отправку ответа зависящей от канала: Telegram — через `Sender`, веб — чтением истории. Проверка: `TestWebReplyIsNotSentAnywhere`, `TestAnswerAsOperatorInWebConversationDoesNotSend` — зелёные.
- [x] 2.3 Убедиться, что кэшируемый префикс не изменился и не зависит от канала. Проверка: `TestCachedPrefixIsIdenticalAcrossChannels`, `TestPrefix_IsByteStable` — зелёные.
- [x] 2.4 Убедиться, что потолок вызовов модели общий. Проверка: `TestWebCallsExhaustSharedModelCeiling`, `TestWebAnswersHonestlyWhenCeilingExhausted` — зелёные.
- [x] 2.5 Распространить эскалацию на веб-канал. Проверка: `TestWebEscalationJoinsSameQueue` — зелёный; дополнительно подтверждено E2E задачи 10 (`support-widget.spec.ts`): «Позвать человека» бьёт по настоящему бэкенду и реально переводит разговор в `escalated`.
- [x] 2.6 Привязывать существующую заявку к веб-разговору. Проверка: `TestWebContact_ConflictWhenConversationAlreadyHasALead`, `TestWebContactRefusesWhenConversationAlreadyHasALead` — зелёные.

## 3. Публичные маршруты

- [x] 3.1 Добавить обработчики начала разговора, отправки сообщения и чтения сообщений. Проверка: `TestWebMessageRejectsForgedToken`, `TestWebMessageRejectsOverlongText`, `TestWebMessages_UnknownTokenIsNotFound` — зелёные.
- [x] 3.2 Зарегистрировать маршруты в `internal/router/support.go` с ограничением частоты по адресу на каждом. Проверка: `TestWebMessageIsRateLimited`, `TestWebContactIsRateLimited` — зелёные; лимиты и их окна перечислены в `auth_rate_limiter.go`.
- [x] 3.3 Внести маршруты в реестр защищаемых маршрутов как публичные и перегенерировать `routes.golden`. Проверка: `go test ./internal/router/` зелёный (`authorization_matrix_test.go` несёт все пять веб-маршрутов как `protPublic`, `routes.golden` их перечисляет).
- [x] 3.4 Хранить только хэш веб-токена. Проверка: `TestWebTokenIsNotStoredInPlainText`, `TestHashWebTokenIsDeterministicAndDoesNotContainTheToken` — зелёные.

## 4. Виджет

- [x] 4.1 Создать `apps/web/src/features/support/` — состояние разговора, хранение токена рядом с `leadToken()`, обращения к API. Проверка: `widgetStore.test.ts`, `widget-api.test.ts` (Jest, 100% покрытия обоих файлов) и вживую — E2E задачи 10, сценарий «...разговор переживает перезагрузку»: реальный токен, реальная персистентность через `localStorage`, перезагрузка страницы, тот же разговор.
- [x] 4.2 Собрать компонент виджета с историей, вводом и состояниями ожидания. Проверка: `SupportWidget.test.tsx` (Jest) зелёный.
- [x] 4.3 Добавить действие перехода в Telegram, переиспользуя существующий deep-link с токеном заявки. Проверка: `SupportLink.test.tsx` (Jest) зелёный — покрывает «с заявкой», «без заявки» и «бот не настроен» (пустой `NEXT_PUBLIC_TELEGRAM_BOT`). Живьём в браузере (дев/прод) не проверялось — это часть выкатки (6.3).
- [x] 4.4 Добавить действие вызова человека. Проверка: E2E задачи 10 — «Позвать человека» бьёт по настоящему `POST /api/v1/public/support/web/human`, конверсия реально переходит в `escalated`.
- [x] 4.5 Добавить форму контакта, появляющуюся только после первого вопроса. Проверка: `SupportWidget.test.tsx` (Jest) плюс E2E задачи 10 — контакт с обоими согласиями сохраняется по-настоящему и виден кураторской очереди с активной ссылкой «Написать» (без согласия на связь — по `curator-leads.spec.ts` те же карточки показывают «Согласия на связь нет»).
- [x] 4.6 Разместить виджет на посадочной странице и в гостевом мастере. Проверка: `app/page.tsx` и `GuestOnboarding.tsx` монтируют `<SupportWidget />`; `npm run type-check` и `npm run lint` (apps/web) проходят без ошибок (589 существующих warning'ов, ни один не в support/); E2E-геометрия — см. 4.7 и отдельный прогон `guest-onboarding.spec.ts`.
- [x] 4.7 Проверить работу виджета через `dev-proxy` на 3070. Проверка: `e2e/tests/support-widget.spec.ts`, 4 сценария, зелёные на настоящем стенде через прокси (порт 3270 в этом прогоне — 3070/3069 в системе оказались заняты другим параллельным стендом; проксирование то же самое, `dev-proxy.mjs` с явными `PROXY_WEB`/`PROXY_API`). Прогнано на **собранном** (`next build && next start`) фронтенде, не только `next dev` — см. отчёт задачи 10 про активный service worker и `serviceWorkers: 'block'`.

## 5. База знаний и документация

- [x] 5.1 Написать раздел `docs/user-guide/` о том, что даёт аккаунт и что делает куратор. Проверка: `docs/user-guide/09-зачем-нужен-аккаунт.md` существует, прочитан целиком в рамках задачи 10 — написан как руководство («что доступно без аккаунта» / «что появляется с аккаунтом»), рекламных формулировок не содержит.
- [x] 5.2 Синхронизировать встроенную копию. Проверка: `TestKnowledgeMatchesUserGuide` зелёный (`go test ./internal/modules/support/`).
- [x] 5.3 Проверить, что бот отвечает на вопрос о регистрации. Проверка: `TestKnowledgeAnswersWhyRegister` зелёный — записанный ответ по базе знаний, без обращения к живой модели.
- [x] 5.4 Дополнить `docs/curator-guide/11-бот-поддержки.md` описанием веб-канала. Проверка: файл существует и описывает оба канала («У бота два канала: Telegram... и виджет на...», особенности эскалации веб-разговора).

## 6. Проверки и выкатка

- [x] 6.1 Прогнать проверки контракта и целостности. Проверка: `node scripts/check-api-contract.mjs`, `node scripts/check-codebase-integrity.mjs`, `node scripts/check-internal-links.mjs`, `node scripts/check-i18n.mjs` — все зелёные (задача 10, отчёт).
- [ ] 6.2 Прогнать полный набор тестов. Проверка: `cd apps/api && go test ./...` и `go test -tags=integration ./...` — зелёные; `cd apps/web && npx jest --coverage` — зелёный, покрытие выше порогов (86.72/81.03/86.1/89.37 против 84/79/85/87). `npm run test:e2e` — **не прогнан целиком**: прогнан проект `auth-tests` (куда входит новый файл) плюс отдельно все пять сценариев, без `client-tests`/`curator-tests`/`admin-tests`. См. отчёт задачи 10 за построчной сверкой и найденными в `auth-tests` дефектами стенда, не связанными с этой задачей (MailHog не поднят, тестовый admin-аккаунт).
- [ ] 6.3 Выкатить на dev и проверить живьём: вопрос из браузера, ответ бота, вызов человека, ответ оператора, переход в Telegram с заявкой. Проверка: наблюдения приложены к PR. **Не входило в задачу 10** — выкатку делает другой исполнитель.
- [ ] 6.4 Проверить поведение при исчерпанном потолке и при выключенном Telegram-боте. Проверка: наблюдения приложены к PR. Потолок и выключенный бот проверены изолированно (E2E задачи 10 и `SupportLink.test.tsx`), но не как «наблюдение на живом dev» — это часть выкатки.
- [ ] 6.5 Выкатить на прод и повторить проверку. Проверка: наблюдения приложены к PR. **Не входило в задачу 10.**
