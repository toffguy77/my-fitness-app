# Public Support Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Дать посетителю без аккаунта задать вопрос боту прямо на сайте, не уходя в Telegram, переиспользуя существующий модуль поддержки целиком.

**Architecture:** Разговор поддержки перестаёт быть телеграмным: у него появляется канал, `chat_id` становится необязательным, для веба заводится хэш токена. Ответ бота строится тем же `Answerer` по той же базе знаний — виджет и Telegram-бот физически не могут разойтись. Различаются только две вещи: как разговор опознаётся и как ответ доходит до человека (в Telegram отправляется, в вебе читается).

**Tech Stack:** Go 1.26 + Gin + database/sql, PostgreSQL, Next.js 16 App Router, React 19, Zustand, Jest + RTL + MSW, Playwright.

**Spec:** `openspec/changes/public-support-widget/` — `proposal.md`, `design.md`, `specs/{web-support-widget,support-bot,lead-capture}/spec.md`

## Global Constraints

- Язык интерфейса и всех пользовательских текстов — **русский**.
- Коммиты — conventional commits.
- **Кэшируемый префикс к модели обязан оставаться байт-стабильным.** Таймстамп, идентификатор запроса, название канала или меняющееся приветствие перед точкой кэша превращают каждый вопрос в промах кэша.
- Бот отвечает **строго** по `docs/user-guide/` и не додумывает. Правка руководства требует `make sync-knowledge` в `apps/api`, иначе `TestKnowledgeMatchesUserGuide` уронит сборку.
- Бот не даёт советов по питанию и тренировкам и не обсуждает цифры конкретного клиента (`docs/curator-guide/11-бот-поддержки.md`).
- Новый маршрут с идентификатором в пути обязан попасть в `protectedRoutes`; изменение маршрутов требует `UPDATE_GOLDEN=1 go test ./internal/router/`.
- `scripts/check-api-contract.mjs`: каждый путь, который зовёт фронтенд, обязан быть в `routes.golden`.
- Локально и в E2E ходить через `scripts/dev-proxy.mjs` на **3070**.
- Подмены скрывают дефекты: проверки того, что попало в базу и что ушло наружу, писать интеграционным тестом на живой базе (`//go:build integration`, `internal/testsupport`), а не sqlmock. Так уже написан `internal/modules/support/delivery_integration_test.go` — следовать ему.
- Пороги покрытия: branches 79 %, functions 85 %, lines 87 %, statements 84 %.
- **Зависимость от соседнего плана.** Столбец `leads.capture_source` и поле `CreateInput.CaptureSource` заводит план `landing-conversion` (задача 10, миграция 074). Если этот план выполняется раньше — завести их здесь и снять задачу 10 там; молча писать в несуществующий столбец нельзя.

---

### Task 1: Канал разговора в схеме

**Files:**
- Create: `apps/api/migrations/075_support_channels_up.sql`
- Create: `apps/api/migrations/075_support_channels_down.sql`
- Create: `apps/api/internal/modules/support/channel_integration_test.go`

**Interfaces:**
- Consumes: `support_conversations` из миграции 052.
- Produces: `support_conversations.channel TEXT NOT NULL DEFAULT 'telegram'`, `chat_id` NULL-допустим, `web_token_hash TEXT UNIQUE`, ограничение `support_conversations_identity_check`.

- [ ] **Step 1: Написать миграцию вверх**

```sql
-- Migration: Support channels
-- Version: 075
--
-- Разговор поддержки был устроен вокруг Telegram, хотя привязан к нему слабо:
-- ответ строит Answerer по базе знаний, эскалация и очередь работают с
-- разговором, потолок вызовов считается глобально. Телеграмного в нём ровно
-- два места — идентификатор чата и отправка ответа.

ALTER TABLE support_conversations
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'telegram'
    CHECK (channel IN ('telegram', 'web'));

-- Хранится только хэш: токен из браузера не должен восстанавливаться из базы.
ALTER TABLE support_conversations
  ADD COLUMN IF NOT EXISTS web_token_hash TEXT UNIQUE;

-- У веб-разговора нет идентификатора чата Telegram.
ALTER TABLE support_conversations ALTER COLUMN chat_id DROP NOT NULL;

-- Ровно один идентификатор на разговор. Без этого снятие NOT NULL открывает
-- возможность строки, которую никто не сможет найти. Приём тот же, что у
-- user_consents_subject_check в миграции 051.
ALTER TABLE support_conversations DROP CONSTRAINT IF EXISTS support_conversations_identity_check;
ALTER TABLE support_conversations ADD CONSTRAINT support_conversations_identity_check
  CHECK ((chat_id IS NOT NULL) <> (web_token_hash IS NOT NULL));

CREATE INDEX IF NOT EXISTS idx_support_conversations_channel
  ON support_conversations(channel, status);

COMMENT ON COLUMN support_conversations.channel IS 'telegram | web';
COMMENT ON COLUMN support_conversations.web_token_hash IS 'Хэш предъявительского токена веб-разговора';
```

- [ ] **Step 2: Написать миграцию вниз**

```sql
-- Откат удаляет веб-разговоры явно: без этого возврат NOT NULL на chat_id
-- уронил бы миграцию на первой же строке из браузера.
DROP INDEX IF EXISTS idx_support_conversations_channel;
ALTER TABLE support_conversations DROP CONSTRAINT IF EXISTS support_conversations_identity_check;

DELETE FROM support_conversations WHERE channel = 'web';

ALTER TABLE support_conversations DROP COLUMN IF EXISTS web_token_hash;
ALTER TABLE support_conversations DROP COLUMN IF EXISTS channel;
ALTER TABLE support_conversations ALTER COLUMN chat_id SET NOT NULL;
```

- [ ] **Step 3: Написать падающий интеграционный тест на ограничение**

```go
//go:build integration

// Проверяется на живой базе намеренно: ограничение CHECK — это поведение
// базы, и sqlmock о нём ничего не знает. Именно оно не даёт появиться
// разговору, которого потом никто не найдёт.
func TestConversationRequiresExactlyOneIdentity(t *testing.T) {
	db := testsupport.DB(t)

	_, err := db.Exec(
		`INSERT INTO support_conversations (chat_id, web_token_hash, channel) VALUES (NULL, NULL, 'web')`)
	require.Error(t, err, "разговор без идентификатора обязан быть отвергнут")

	_, err = db.Exec(
		`INSERT INTO support_conversations (chat_id, web_token_hash, channel) VALUES (42, 'hash', 'web')`)
	require.Error(t, err, "разговор с двумя идентификаторами обязан быть отвергнут")

	_, err = db.Exec(
		`INSERT INTO support_conversations (chat_id, channel) VALUES (43, 'telegram')`)
	require.NoError(t, err)

	_, err = db.Exec(
		`INSERT INTO support_conversations (web_token_hash, channel) VALUES ('hash2', 'web')`)
	require.NoError(t, err)
}

// Существующие разговоры получают канал значением по умолчанию — данные не
// правятся, и их число не меняется.
func TestExistingConversationsBecomeTelegram(t *testing.T) {
	db := testsupport.DB(t)

	var total, telegram int
	require.NoError(t, db.QueryRow(`SELECT count(*) FROM support_conversations`).Scan(&total))
	require.NoError(t, db.QueryRow(
		`SELECT count(*) FROM support_conversations WHERE channel = 'telegram' AND chat_id IS NOT NULL`).
		Scan(&telegram))

	assert.Equal(t, total, telegram)
}
```

- [ ] **Step 4: Запустить и убедиться, что падает**

Run: `cd apps/api && go test -tags=integration ./internal/modules/support/ -run TestConversationRequires -v`
Expected: FAIL — столбцов ещё нет.

- [ ] **Step 5: Применить миграцию и прогнать тесты**

Run: `cd apps/api && go test ./internal/shared/database/`
Expected: PASS — миграция 075 применяется в общем прогоне.

Run: `cd apps/api && go test -tags=integration ./internal/modules/support/ -run 'TestConversationRequires|TestExistingConversations' -v`
Expected: PASS оба.

- [ ] **Step 6: Проверить откат на базе с обоими каналами**

Run: применить 075 вверх, вставить по разговору каждого канала, применить 075 вниз.
Expected: откат проходит без ошибки, веб-разговор удалён, телеграмный остался.

- [ ] **Step 7: Commit**

```bash
git add apps/api/migrations/075_support_channels_up.sql apps/api/migrations/075_support_channels_down.sql apps/api/internal/modules/support/channel_integration_test.go
git commit -m "feat(support): канал разговора и ровно один идентификатор"
```

---

### Task 2: Создание и поиск веб-разговора

**Files:**
- Create: `apps/api/internal/modules/support/web.go`
- Create: `apps/api/internal/modules/support/web_test.go`
- Modify: `apps/api/internal/modules/support/service.go` (`conversationFor`, строка 506)
- Modify: `apps/api/internal/modules/support/types.go`

**Interfaces:**
- Consumes: схема из задачи 1; `Conversation` из `support/types.go`; `IncomingMessage` из `support/types.go`.
- Produces:
  - `func (s *Service) StartWebConversation(ctx context.Context) (conversationID, token string, err error)`
  - `func (s *Service) WebConversationByToken(ctx context.Context, token string) (*Conversation, error)`
  - `func hashWebToken(token string) string`
  - поле `Conversation.Channel string`

- [ ] **Step 1: Написать падающий тест на выдачу и опознание токена**

```go
func TestStartWebConversationIssuesToken(t *testing.T) {
	svc, mock := setupService(t)

	mock.ExpectQuery(`INSERT INTO support_conversations`).
		WithArgs(sqlmock.AnyArg(), "web").
		WillReturnRows(sqlmock.NewRows([]string{"id"}).
			AddRow("11111111-1111-1111-1111-111111111111"))

	id, token, err := svc.StartWebConversation(context.Background())

	require.NoError(t, err)
	assert.NotEmpty(t, id)
	assert.NotEmpty(t, token)
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestWebConversationRejectsForgedToken(t *testing.T) {
	svc, mock := setupService(t)
	mock.ExpectQuery(`FROM support_conversations`).WillReturnError(sql.ErrNoRows)

	_, err := svc.WebConversationByToken(context.Background(), "forged")

	assert.True(t, errors.Is(err, apperrors.ErrNotFound))
}
```

- [ ] **Step 2: Написать падающий интеграционный тест на то, что токен не лежит в базе**

```go
//go:build integration

// Проверяется на живой базе: вопрос «что именно оказалось в строке» на
// подмене не имеет смысла — sqlmock хранит то, что ему сказали ожидать.
func TestWebTokenIsNotStoredInPlainText(t *testing.T) {
	db := testsupport.DB(t)
	svc := newServiceForTest(t, db)

	id, token, err := svc.StartWebConversation(context.Background())
	require.NoError(t, err)

	var stored string
	require.NoError(t, db.QueryRow(
		`SELECT web_token_hash FROM support_conversations WHERE id = $1`, id).Scan(&stored))

	assert.NotEqual(t, token, stored)
	assert.NotContains(t, stored, token)
}
```

- [ ] **Step 3: Запустить и убедиться, что падают**

Run: `cd apps/api && go test ./internal/modules/support/ -run TestStartWebConversation -v`
Expected: FAIL — `undefined: StartWebConversation`.

- [ ] **Step 4: Реализовать**

```go
// Package support, файл web.go — всё, что отличает веб-канал от Telegram.
//
// Отличий ровно два: чем опознаётся собеседник и как до него доходит ответ.
// Всё остальное — ответ по базе знаний, эскалация, потолок вызовов, привязка
// заявки — общее, и именно поэтому веб и Telegram не могут разойтись.

// hashWebToken — то, что хранится вместо токена.
func hashWebToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// StartWebConversation заводит разговор из браузера и выдаёт предъявительский
// токен. Токен читает только наш собственный код на наших же страницах —
// поэтому он передаётся явно, а не cookie: cookie прикладывалась бы и к
// запросам пользователя с сессией, где сервер обязан был бы её игнорировать.
func (s *Service) StartWebConversation(ctx context.Context) (string, string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", "", fmt.Errorf("generate web token: %w", err)
	}
	token := base64.RawURLEncoding.EncodeToString(raw)

	var id string
	if err := s.db.QueryRowContext(ctx,
		`INSERT INTO support_conversations (web_token_hash, channel)
		 VALUES ($1, $2) RETURNING id`,
		hashWebToken(token), ChannelWeb).Scan(&id); err != nil {
		return "", "", fmt.Errorf("create web conversation: %w", err)
	}

	return id, token, nil
}

// WebConversationByToken находит разговор по предъявленному токену.
func (s *Service) WebConversationByToken(ctx context.Context, token string) (*Conversation, error) {
	if token == "" {
		return nil, apperrors.ErrNotFound
	}
	conversation, err := s.byWebTokenHash(ctx, hashWebToken(token))
	if errors.Is(err, sql.ErrNoRows) {
		// Поддельный и чужой токен неразличимы наружу.
		return nil, apperrors.ErrNotFound
	}
	return conversation, err
}
```

Константы канала объявить в `types.go`:

```go
// Каналы разговора. Их два, и это исчерпывающий список.
const (
	ChannelTelegram = "telegram"
	ChannelWeb      = "web"
)
```

- [ ] **Step 5: Провести канал через существующее чтение разговора**

В `conversationFor` (`service.go:506`) и `byID` (`service.go:527`) добавить `channel` в список выбираемых столбцов и в `Conversation`. Логику не менять.

- [ ] **Step 6: Запустить тесты**

Run: `cd apps/api && go test ./internal/modules/support/`
Run: `cd apps/api && go test -tags=integration ./internal/modules/support/ -run TestWebTokenIsNotStored -v`
Expected: PASS; существующие телеграмные тесты не сломаны.

- [ ] **Step 7: Commit**

```bash
git add apps/api/internal/modules/support/web.go apps/api/internal/modules/support/web_test.go apps/api/internal/modules/support/service.go apps/api/internal/modules/support/types.go
git commit -m "feat(support): веб-разговор с предъявительским токеном"
```

---
### Task 3: Ответ по каналу и неизменность префикса

**Files:**
- Modify: `apps/api/internal/modules/support/service.go` (`reply`, строка 279; `answerAs`, строка 315; `cachedPrefix`, строка 389)
- Create: `apps/api/internal/modules/support/prefix_channel_test.go`
- Modify: `apps/api/internal/modules/support/web_test.go`

**Interfaces:**
- Consumes: `ChannelWeb`, `ChannelTelegram` (задача 2); существующий `Sender`.
- Produces: `reply` становится зависящим от канала; новых экспортов нет.

- [ ] **Step 1: Написать падающий тест на байтовое совпадение префикса**

```go
// Префикс обязан совпадать побайтово во всех каналах: иначе веб обнуляет кэш,
// и каждый вопрос начинает стоить полную цену. Это не оптимизация, а условие,
// при котором дневной потолок вообще имеет смысл.
func TestCachedPrefixIsIdenticalAcrossChannels(t *testing.T) {
	svc, _ := setupService(t)

	forTelegram, err := svc.cachedPrefix()
	require.NoError(t, err)
	forWeb, err := svc.cachedPrefix()
	require.NoError(t, err)

	assert.Equal(t, forTelegram, forWeb)

	// Ни канала, ни времени, ни идентификатора разговора в префиксе быть не
	// должно — каждое из них делает его уникальным на запрос.
	assert.NotContains(t, forWeb, ChannelWeb)
	assert.NotContains(t, forWeb, ChannelTelegram)
	assert.NotContains(t, forWeb, time.Now().Format("2006"))
}
```

- [ ] **Step 2: Написать падающий интеграционный тест на то, что в веб ничего не отправляется**

```go
//go:build integration

// В браузер постучаться некуда. Ответ обязан быть записан и прочитан, а не
// отправлен — и попытки отправки быть не должно вовсе, иначе отказ
// несуществующего адресата попадёт в логи как ошибка доставки.
func TestWebReplyIsNotSentAnywhere(t *testing.T) {
	db := testsupport.DB(t)
	sender := &countingSender{}
	svc := newServiceWithSender(t, db, sender)

	id, token, err := svc.StartWebConversation(context.Background())
	require.NoError(t, err)

	require.NoError(t, svc.AnswerAsOperator(context.Background(), id, 1, "Отвечаю"))

	assert.Zero(t, sender.calls, "в веб-канале отправлять некуда")

	conversation, err := svc.WebConversationByToken(context.Background(), token)
	require.NoError(t, err)
	messages, err := svc.MessagesFor(context.Background(), conversation.ID)
	require.NoError(t, err)
	require.NotEmpty(t, messages)
	assert.Equal(t, "Отвечаю", messages[len(messages)-1].Text)
}
```

- [ ] **Step 3: Запустить и убедиться, что падают**

Run: `cd apps/api && go test ./internal/modules/support/ -run TestCachedPrefixIsIdentical -v`
Expected: FAIL или PASS — если PASS, тест всё равно нужен: он охраняет свойство, которое легко потерять следующей правкой.

Run: `cd apps/api && go test -tags=integration ./internal/modules/support/ -run TestWebReplyIsNotSent -v`
Expected: FAIL — отправка вызывается безусловно.

- [ ] **Step 4: Сделать отправку зависящей от канала**

```go
// reply записывает ответ и доставляет его так, как умеет канал.
//
// В Telegram ответ отправляется. В браузер отправлять некуда: клиент сам
// придёт за сообщениями со своим токеном, и доставкой считается факт выдачи.
func (s *Service) reply(ctx context.Context, conversation *Conversation, text string) error {
	messageID, err := s.recordMessage(ctx, conversation.ID, "bot", text, nil)
	if err != nil {
		return err
	}

	if conversation.Channel == ChannelWeb {
		return nil
	}

	if err := s.sender.Send(ctx, *conversation.ChatID, text); err != nil {
		return err
	}
	return s.markDelivered(ctx, messageID)
}
```

Ту же развилку внести в `answerAs` (`service.go:315`) — путь ответа оператора.

- [ ] **Step 5: Добавить чтение сообщений разговора**

```go
// MessagesFor отдаёт переписку разговора в порядке появления.
func (s *Service) MessagesFor(ctx context.Context, conversationID string) ([]Message, error)
```

Реализовать по образцу существующего `Thread` (`service.go:595`), но без сведений о заявке: посетителю они не нужны и не должны быть доступны по предъявительскому токену.

- [ ] **Step 6: Запустить тесты**

Run: `cd apps/api && go test ./internal/modules/support/`
Run: `cd apps/api && go test -tags=integration ./internal/modules/support/`
Expected: PASS, включая существующий `delivery_integration_test.go` — телеграмная доставка не затронута.

- [ ] **Step 7: Commit**

```bash
git add apps/api/internal/modules/support/
git commit -m "feat(support): ответ доставляется способом канала"
```

---

### Task 4: Публичные маршруты виджета

**Files:**
- Modify: `apps/api/internal/modules/support/handler.go`
- Modify: `apps/api/internal/router/support.go`
- Modify: `apps/api/internal/router/authorization_matrix_test.go`
- Modify: `apps/api/internal/router/testdata/routes.golden` (перегенерация)
- Modify: `apps/api/internal/modules/support/web_test.go`

**Interfaces:**
- Consumes: `StartWebConversation`, `WebConversationByToken`, `MessagesFor`, `HandleMessage` (задачи 2–3).
- Produces: три маршрута —
  - `POST /api/v1/public/support/web` → `{ "token": "...", "conversation_id": "..." }`
  - `POST /api/v1/public/support/web/message` → `{ "token": "...", "text": "..." }`
  - `GET /api/v1/public/support/web/messages?token=...` → `{ "messages": [...], "status": "open|escalated|closed" }`

- [ ] **Step 1: Написать падающие тесты на отказы**

```go
func TestWebMessageRejectsForgedToken(t *testing.T) {
	r, _, mock := setupHandler(t)
	mock.ExpectQuery(`FROM support_conversations`).WillReturnError(sql.ErrNoRows)

	w := post(r, "/public/support/web/message", `{"token":"forged","text":"привет"}`)

	assert.Equal(t, http.StatusNotFound, w.Code)
}

func TestWebMessageRejectsOverlongText(t *testing.T) {
	r, _, _ := setupHandler(t)

	body, err := json.Marshal(map[string]string{
		"token": "whatever",
		"text":  strings.Repeat("а", MaxWebMessageRunes+1),
	})
	require.NoError(t, err)

	w := post(r, "/public/support/web/message", string(body))

	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.Contains(t, w.Body.String(), "короче")
}

func TestWebConversationRefusesWhenTooManyMessages(t *testing.T) {
	r, _, mock := setupHandler(t)
	expectConversationWithMessageCount(mock, MaxWebMessagesPerConversation)

	w := post(r, "/public/support/web/message", `{"token":"good","text":"ещё"}`)

	assert.Equal(t, http.StatusTooManyRequests, w.Code)
}
```

- [ ] **Step 2: Запустить и убедиться, что падают**

Run: `cd apps/api && go test ./internal/modules/support/ -run TestWeb -v`
Expected: FAIL — обработчиков нет.

- [ ] **Step 3: Реализовать обработчики**

```go
// Пределы публичного разговора. Ни один не защищает в одиночку: частота
// сдерживает поток, длина — стоимость одного вопроса, число сообщений —
// разговор, который ведут не ради ответа.
const (
	MaxWebMessageRunes            = 1000
	MaxWebMessagesPerConversation = 30
)

// StartWeb handles POST /api/v1/public/support/web.
func (h *Handler) StartWeb(c *gin.Context) {
	id, token, err := h.service.StartWebConversation(c.Request.Context())
	if err != nil {
		h.log.Error("Failed to start web conversation", "error", err)
		response.InternalError(c, "Не удалось открыть чат")
		return
	}
	response.Success(c, http.StatusCreated, gin.H{"token": token, "conversation_id": id})
}

// WebMessage handles POST /api/v1/public/support/web/message.
func (h *Handler) WebMessage(c *gin.Context) {
	var req struct {
		Token string `json:"token" binding:"required"`
		Text  string `json:"text" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "Неверные данные запроса")
		return
	}
	if utf8.RuneCountInString(req.Text) > MaxWebMessageRunes {
		response.Error(c, http.StatusBadRequest, "Вопрос получился длинным — напишите короче")
		return
	}

	conversation, err := h.service.WebConversationByToken(c.Request.Context(), req.Token)
	if err != nil {
		// Поддельный, чужой и удалённый токен неразличимы.
		response.NotFound(c, "Чат не найден — откройте его заново")
		return
	}

	err = h.service.HandleMessage(c.Request.Context(), IncomingMessage{
		ConversationID: conversation.ID,
		Channel:        ChannelWeb,
		Text:           req.Text,
	})
	switch {
	case err == nil:
	case errors.Is(err, apperrors.ErrTooManyRequests):
		response.Error(c, http.StatusTooManyRequests,
			"В этом чате слишком много сообщений — позовите человека")
		return
	default:
		h.log.Error("Failed to handle web message", "error", err)
		response.InternalError(c, "Не удалось отправить сообщение")
		return
	}

	response.Success(c, http.StatusOK, nil)
}
```

`WebMessages` — чтение: находит разговор по токену, отдаёт `MessagesFor` и `status`.

- [ ] **Step 4: Зарегистрировать маршруты**

В `apps/api/internal/router/support.go`, рядом с телеграмным вебхуком:

```go
	// Разговор из браузера. Это единственные эндпоинты поддержки, которые
	// посетитель без аккаунта зовёт со своим телом, и каждый из них тратит
	// деньги на модель — поэтому лимит по адресу на всех трёх.
	web := v1.Group("/public/support/web")
	web.POST("", d.AuthRateLimiter.Limit("support-web-start"), d.Support.StartWeb)
	web.POST("/message", d.AuthRateLimiter.Limit("support-web-message"), d.Support.WebMessage)
	web.GET("/messages", d.AuthRateLimiter.Limit("support-web-read"), d.Support.WebMessages)
```

- [ ] **Step 5: Внести маршруты в реестр защищаемых**

Маршруты не несут идентификатора в пути — разговор адресуется токеном в теле или в строке запроса именно для того, чтобы посторонний не мог перебрать чужие. Если `TestAuthorizationMatrixIsComplete` всё же потребует записей, добавить их как `protPublic` с комментарием, объясняющим, почему разговор адресуется токеном.

- [ ] **Step 6: Перегенерировать golden и просмотреть дифф**

Run: `cd apps/api && UPDATE_GOLDEN=1 go test ./internal/router/`
Run: `git diff apps/api/internal/router/testdata/routes.golden`
Expected: ровно три новые строки.

- [ ] **Step 7: Написать тест на ограничение частоты**

```go
func TestWebMessageIsRateLimited(t *testing.T) {
	r := routerWithRealLimiter(t)

	var last *httptest.ResponseRecorder
	for i := 0; i < 40; i++ {
		last = post(r, "/api/v1/public/support/web/message", `{"token":"t","text":"вопрос"}`)
	}

	assert.Equal(t, http.StatusTooManyRequests, last.Code)
}
```

- [ ] **Step 8: Запустить всё**

Run: `cd apps/api && go test ./internal/modules/support/ ./internal/router/`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/api/internal/modules/support/handler.go apps/api/internal/router/ apps/api/internal/modules/support/web_test.go
git commit -m "feat(support): публичные маршруты веб-виджета"
```

---

### Task 5: Эскалация и потолок вызовов в веб-канале

**Files:**
- Modify: `apps/api/internal/modules/support/service.go` (`escalate`, строка 249; `allowModelCall`, строка 417)
- Create: `apps/api/internal/modules/support/web_escalation_integration_test.go`

**Interfaces:**
- Consumes: маршруты из задачи 4; существующий `escalate`.
- Produces: `func (s *Service) EscalateWeb(ctx context.Context, token string) error`.

- [ ] **Step 1: Написать падающий интеграционный тест на общую очередь**

```go
//go:build integration

// Очередь у оператора одна. Разговор из браузера обязан попасть в неё
// наравне с телеграмным — иначе виджет становится вторым ботом со своей
// очередью, и они разъедутся.
func TestWebEscalationJoinsSameQueue(t *testing.T) {
	db := testsupport.DB(t)
	svc := newServiceForTest(t, db)

	_, webToken, err := svc.StartWebConversation(context.Background())
	require.NoError(t, err)
	require.NoError(t, svc.EscalateWeb(context.Background(), webToken))

	seedEscalatedTelegramConversation(t, db, 555)

	queue, total, err := svc.ListConversations(context.Background(), "escalated", 10, 0)
	require.NoError(t, err)

	assert.Equal(t, 2, total)
	channels := []string{queue[0].Channel, queue[1].Channel}
	assert.Contains(t, channels, ChannelWeb)
	assert.Contains(t, channels, ChannelTelegram)
}
```

- [ ] **Step 2: Написать падающий тест на общий потолок**

```go
// Потолок защищает счёт, а счёт один. Веб-канал не имеет собственного
// лимита вызовов модели — он расходует тот же.
func TestWebCallsExhaustSharedModelCeiling(t *testing.T) {
	svc, _ := setupServiceWithDailyLimit(t, 2)

	assert.True(t, svc.allowModelCall())
	assert.True(t, svc.allowModelCall())
	assert.False(t, svc.allowModelCall(), "третий вызов обязан быть отклонён независимо от канала")
}
```

- [ ] **Step 3: Запустить и убедиться, что падают**

Run: `cd apps/api && go test -tags=integration ./internal/modules/support/ -run TestWebEscalation -v`
Expected: FAIL — `undefined: EscalateWeb`.

- [ ] **Step 4: Реализовать вызов человека**

```go
// EscalateWeb — «позвать человека» из виджета.
//
// Отдельный метод нужен только чтобы найти разговор по токену: дальше идёт тот
// же escalate, что и в Telegram, и разговор попадает в ту же очередь.
func (s *Service) EscalateWeb(ctx context.Context, token string) error {
	conversation, err := s.WebConversationByToken(ctx, token)
	if err != nil {
		return err
	}
	return s.escalate(ctx, conversation, "посетитель попросил человека")
}
```

Добавить маршрут `POST /public/support/web/human` рядом с остальными (задача 4) и перегенерировать golden.

- [ ] **Step 5: Проверить, что исчерпанный потолок отвечает честно в обоих каналах**

Существующая ветка `if !s.allowModelCall()` (`service.go:181`) уже отвечает человеку и зовёт оператора. Убедиться тестом, что для веб-разговора она ведёт себя так же:

```go
func TestWebAnswersHonestlyWhenCeilingExhausted(t *testing.T) {
	svc, mock := setupServiceWithDailyLimit(t, 0)
	expectWebConversation(mock)

	err := svc.HandleMessage(context.Background(), IncomingMessage{
		ConversationID: "11111111-1111-1111-1111-111111111111",
		Channel:        ChannelWeb,
		Text:           "вопрос",
	})

	require.NoError(t, err)
	// Вызова модели не было, а человеку сказали правду и предложили оператора.
	assertLastBotMessageOffersHuman(t, mock)
}
```

- [ ] **Step 6: Запустить всё**

Run: `cd apps/api && go test ./internal/modules/support/ && go test -tags=integration ./internal/modules/support/`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/internal/modules/support/ apps/api/internal/router/
git commit -m "feat(support): вызов человека из виджета в общую очередь"
```

---
### Task 6: Заявка из разговора

**Files:**
- Modify: `apps/api/internal/modules/support/handler.go`
- Modify: `apps/api/internal/modules/support/web.go`
- Modify: `apps/api/internal/router/support.go`
- Create: `apps/api/internal/modules/support/web_lead_integration_test.go`

**Interfaces:**
- Consumes: `leads.Service.Create` (`modules/leads/service.go:39`); `attachLead` (`support/service.go:435`); `LeadIDForToken` (`leads/service.go:211`).
- Produces: маршрут `POST /api/v1/public/support/web/contact`; `func (s *Service) SaveWebContact(ctx context.Context, token, email string, consents leads.Consents, ip, ua string) (string, error)` — возвращает токен заявки.

- [ ] **Step 1: Написать падающий интеграционный тест**

```go
//go:build integration

// Контакт из бота — та же заявка, что из мастера. Вторая таблица контактов
// означала бы вторую отписку, второй срок хранения и второе место, где можно
// забыть проверить согласие.
func TestWebContactCreatesLeadAndAttachesIt(t *testing.T) {
	db := testsupport.DB(t)
	svc := newServiceForTest(t, db)

	id, token, err := svc.StartWebConversation(context.Background())
	require.NoError(t, err)

	leadToken, err := svc.SaveWebContact(context.Background(), token, "bot@example.com",
		leads.Consents{DataProcessing: true, Contact: true}, "127.0.0.1", "test")
	require.NoError(t, err)
	assert.NotEmpty(t, leadToken)

	var captureSource string
	var attached *string
	require.NoError(t, db.QueryRow(
		`SELECT l.capture_source, c.lead_id::text
		   FROM support_conversations c JOIN leads l ON l.id = c.lead_id
		  WHERE c.id = $1`, id).Scan(&captureSource, &attached))

	assert.Equal(t, "bot", captureSource)
	require.NotNil(t, attached)
}

// Без согласия на обработку заявки не возникает, а разговор продолжается.
func TestWebContactWithoutConsentSavesNothing(t *testing.T) {
	db := testsupport.DB(t)
	svc := newServiceForTest(t, db)

	id, token, err := svc.StartWebConversation(context.Background())
	require.NoError(t, err)

	_, err = svc.SaveWebContact(context.Background(), token, "bot2@example.com",
		leads.Consents{DataProcessing: false}, "127.0.0.1", "test")
	require.Error(t, err)

	var leadID *string
	require.NoError(t, db.QueryRow(
		`SELECT lead_id::text FROM support_conversations WHERE id = $1`, id).Scan(&leadID))
	assert.Nil(t, leadID)

	// Разговор жив.
	_, err = svc.WebConversationByToken(context.Background(), token)
	assert.NoError(t, err)
}
```

- [ ] **Step 2: Запустить и убедиться, что падают**

Run: `cd apps/api && go test -tags=integration ./internal/modules/support/ -run TestWebContact -v`
Expected: FAIL — `undefined: SaveWebContact`.

- [ ] **Step 3: Реализовать**

```go
// SaveWebContact сохраняет контакт, оставленный в разговоре, как заявку.
//
// Отдельной сущности «контакт из бота» нет намеренно: правила согласий, срок
// хранения и отписка у заявки уже есть, и второй их набор неизбежно разошёлся
// бы с первым.
func (s *Service) SaveWebContact(
	ctx context.Context, token, email string, consents leads.Consents, ip, ua string,
) (string, error) {
	conversation, err := s.WebConversationByToken(ctx, token)
	if err != nil {
		return "", err
	}

	// Заявка уже есть — повторно контакт не берём.
	if conversation.LeadID != nil {
		return "", apperrors.ErrConflict
	}

	lead, leadToken, err := s.leadsWriter.Create(ctx, leads.CreateInput{
		Email:         email,
		LastStep:      "bot",
		CaptureSource: "bot",
		Consents:      consents,
	}, ip, ua)
	if err != nil {
		return "", err
	}

	if _, err := s.db.ExecContext(ctx,
		`UPDATE support_conversations SET lead_id = $2 WHERE id = $1`,
		conversation.ID, lead.ID); err != nil {
		return "", fmt.Errorf("attach lead to web conversation: %w", err)
	}

	return leadToken, nil
}
```

`leadsWriter` — новая зависимость сервиса. Существующий `LeadResolver` умеет только читать (`LeadIDForToken`); расширить интерфейс, а не заводить второй.

- [ ] **Step 4: Добавить обработчик и маршрут**

`POST /public/support/web/contact` с лимитом `support-web-contact`; отказ при отсутствующем согласии — `400` с текстом «Нужно согласие на обработку персональных данных», как в `leads/handler.go:37`.

- [ ] **Step 5: Перегенерировать golden**

Run: `cd apps/api && UPDATE_GOLDEN=1 go test ./internal/router/ && git diff apps/api/internal/router/testdata/routes.golden`
Expected: одна новая строка.

- [ ] **Step 6: Запустить всё**

Run: `cd apps/api && go test ./internal/modules/support/ ./internal/router/ && go test -tags=integration ./internal/modules/support/`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/internal/modules/support/ apps/api/internal/router/
git commit -m "feat(support): контакт из разговора сохраняется как заявка"
```

---

### Task 7: Клиент и состояние виджета

**Files:**
- Create: `apps/web/src/features/support/api/widget.ts`
- Create: `apps/web/src/features/support/store/widgetStore.ts`
- Create: `apps/web/src/features/support/index.ts`
- Create: `apps/web/src/features/support/__tests__/widget-api.test.ts`

**Interfaces:**
- Consumes: маршруты из задач 4–6; `apiClient`; `leadToken`, `rememberLeadToken` из `@/features/onboarding/api/guest`.
- Produces:
  - `export const widgetApi = { start(), send(token, text), messages(token), human(token), contact(token, email, consents) }`
  - `export const WIDGET_TOKEN_KEY = 'support_web_token'`
  - `export function widgetToken(): string | null`
  - `export const useWidgetStore` — Zustand: `{ open, token, messages, status, sending, error }`

- [ ] **Step 1: Написать падающий тест на хранение токена**

```ts
describe('widgetToken', () => {
    it('переживает перезагрузку страницы', async () => {
        const { token } = await widgetApi.start()
        expect(widgetToken()).toBe(token)
    })

    it('возвращает null, когда хранилище недоступно', () => {
        jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('заблокировано')
        })
        expect(widgetToken()).toBeNull()
    })
})
```

Второй случай не теоретический: в приватном окне и при запрете хранилища доступ бросает, и виджет обязан открыться, а не упасть.

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `cd apps/web && npx jest src/features/support/__tests__/widget-api.test.ts`
Expected: FAIL — модуля нет.

- [ ] **Step 3: Реализовать клиент**

```ts
/**
 * Разговор с ботом до регистрации.
 *
 * Токен хранится явно и передаётся явно — в отличие от токена заявки, у
 * которого есть вторая копия в cookie. Она нужна ему потому, что при входе
 * через внешнего провайдера браузер уходит и возвращается на серверный
 * колбэк, которому localStorage недоступен. У виджета такого перехода нет.
 */

import { apiClient } from '@/shared/utils/api-client'

export const WIDGET_TOKEN_KEY = 'support_web_token'

export function widgetToken(): string | null {
    try {
        return localStorage.getItem(WIDGET_TOKEN_KEY)
    } catch {
        // Приватное окно или запрет хранилища: разговор будет разовым, но
        // виджет обязан открыться.
        return null
    }
}
```

Остальные методы — по образцу `guestApi` (`features/onboarding/api/guest.ts`).

- [ ] **Step 4: Реализовать состояние**

Zustand-хранилище, не персистентное: переживать перезагрузку должен токен, а переписку виджет перечитывает с сервера при открытии.

- [ ] **Step 5: Запустить тесты**

Run: `cd apps/web && npx jest src/features/support/`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/support/
git commit -m "feat(support): клиент и состояние веб-виджета"
```

---

### Task 8: Компонент виджета

**Files:**
- Create: `apps/web/src/features/support/components/SupportWidget.tsx`
- Create: `apps/web/src/features/support/components/__tests__/SupportWidget.test.tsx`
- Modify: `apps/web/src/shared/components/SupportLink.tsx`
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/features/onboarding/components/GuestOnboarding.tsx`

**Interfaces:**
- Consumes: `widgetApi`, `useWidgetStore` (задача 7); `SupportLink` — существующий компонент перехода в Telegram.
- Produces: `export function SupportWidget()`.

- [ ] **Step 1: Написать падающие тесты**

```tsx
describe('SupportWidget', () => {
    it('отвечает на вопрос без аккаунта', async () => {
        render(<SupportWidget />)
        await userEvent.click(screen.getByRole('button', { name: /задать вопрос/i }))
        await userEvent.type(screen.getByRole('textbox'), 'что даст регистрация?')
        await userEvent.click(screen.getByRole('button', { name: /отправить/i }))

        expect(await screen.findByText(/дневник/i)).toBeInTheDocument()
    })

    it('не предлагает оставить контакт до первого вопроса', async () => {
        render(<SupportWidget />)
        await userEvent.click(screen.getByRole('button', { name: /задать вопрос/i }))

        expect(screen.queryByLabelText(/почт/i)).not.toBeInTheDocument()
    })

    it('предлагает оставить контакт, когда разговор ушёл к человеку', async () => {
        server.use(http.get('*/public/support/web/messages', () =>
            HttpResponse.json({ data: { status: 'escalated', messages: [] } })))

        render(<SupportWidget />)
        await openAndAsk('вопрос')

        expect(await screen.findByLabelText(/почт/i)).toBeInTheDocument()
    })

    it('не предлагает Telegram, когда бот не настроен', async () => {
        process.env.NEXT_PUBLIC_TELEGRAM_BOT = ''
        render(<SupportWidget />)
        await userEvent.click(screen.getByRole('button', { name: /задать вопрос/i }))

        expect(screen.queryByTestId('support-link')).not.toBeInTheDocument()
        expect(screen.getByRole('textbox')).toBeInTheDocument()
    })
})
```

- [ ] **Step 2: Запустить и убедиться, что падают**

Run: `cd apps/web && npx jest src/features/support/components/`
Expected: FAIL — компонента нет.

- [ ] **Step 3: Реализовать компонент**

Состав: свёрнутая кнопка «Задать вопрос»; развёрнутая панель с историей, полем ввода и отправкой; строка действий — «Позвать человека» и `SupportLink` (переход в Telegram, если бот настроен); форма контакта, появляющаяся **только** после первого отправленного вопроса и при `status === 'escalated'` либо по явному действию «Сохранить переписку».

Опрос сообщений — по запросу и по таймеру, пока панель открыта; закрытая панель не опрашивает. Сокет здесь не нужен: разговор редкий и короткий.

- [ ] **Step 4: Встроить `SupportLink` в виджет**

`SupportLink` остаётся компонентом перехода в Telegram с токеном заявки — менять его логику не нужно, он уже читает `leadToken()` и сам прячется при отсутствии `NEXT_PUBLIC_TELEGRAM_BOT`. В подвале посадочной страницы он остаётся как есть.

- [ ] **Step 5: Разместить виджет**

На посадочной странице и в гостевом мастере. На страницы статей **не** ставить — это расширение публичной поверхности без нужды (`design.md`, Open Questions).

- [ ] **Step 6: Запустить тесты и проверки**

Run: `cd apps/web && npx jest src/features/support/ src/app/__tests__/page.test.tsx`
Run: `cd apps/web && npm run lint && npm run type-check`
Expected: PASS без ошибок.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/support/ apps/web/src/app/page.tsx apps/web/src/features/onboarding/components/GuestOnboarding.tsx
git commit -m "feat(support): виджет разговора с ботом на сайте"
```

---

### Task 9: Ответ на вопрос о регистрации в базе знаний

**Files:**
- Create: `docs/user-guide/09-зачем-нужен-аккаунт.md`
- Modify: `apps/api/internal/modules/support/knowledge/` (через `make sync-knowledge`)
- Modify: `docs/curator-guide/11-бот-поддержки.md`
- Create: `apps/api/internal/modules/support/registration_answer_test.go`

**Interfaces:**
- Consumes: существующая база знаний и `TestKnowledgeMatchesUserGuide`.
- Produces: раздел руководства, на который бот может сослаться.

- [ ] **Step 1: Написать падающий тест на наличие ответа**

```go
// Без этого раздела бот на самый частый вопрос незарегистрированного честно
// отвечает, что не знает, — и виджет теряет смысл. Ответ пишется в
// руководство, а не в промпт: правило «отвечай строго по руководству» —
// единственное, что отделяет бота от выдумывания.
func TestKnowledgeAnswersWhyRegister(t *testing.T) {
	kb, err := LoadKnowledge()
	require.NoError(t, err)

	text := strings.ToLower(kb.Text())

	assert.Contains(t, text, "аккаунт")
	assert.Contains(t, text, "куратор")
	assert.Contains(t, text, "дневник")
}
```

- [ ] **Step 2: Написать раздел руководства**

Файл `docs/user-guide/09-зачем-нужен-аккаунт.md`. Содержание:

- что доступно **без** аккаунта: расчёт нормы КБЖУ и воды, вопросы боту;
- что появляется **с** аккаунтом: дневник питания, сканер штрих-кодов, распознавание еды по фото, водный баланс, история и прогресс, статьи;
- что делает **куратор**: недельные планы КБЖУ, задачи, разбор еженедельных отчётов, чат;
- **чем куратор отличается от бота**: бот отвечает про платформу, куратор — про питание и тренировки;
- **что мы не обещаем**: сроков и результата.

Писать как руководство, а не как рекламу: файл читают и люди, он лежит в публичной документации. Цену не называть — она не определена (`design.md`, Open Questions предложения `landing-conversion`).

- [ ] **Step 3: Синхронизировать встроенную копию**

Run: `cd apps/api && make sync-knowledge`
Expected: файлы в `internal/modules/support/knowledge/` обновлены.

- [ ] **Step 4: Запустить тесты**

Run: `cd apps/api && go test ./internal/modules/support/ -run 'TestKnowledge' -v`
Expected: PASS оба — и новый, и `TestKnowledgeMatchesUserGuide`.

- [ ] **Step 5: Проверить, что бот действительно отвечает**

Записать ответ модели на вопрос «зачем мне регистрироваться» и убедиться, что он опирается на новый раздел и не содержит обещаний сроков и результата. Приложить к PR.

- [ ] **Step 6: Дополнить руководство куратора**

В `docs/curator-guide/11-бот-поддержки.md` добавить: каналов два — Telegram и виджет на сайте; отвечают они одним и тем же; ответ в веб-разговор человек увидит, когда вернётся на страницу, а написать ему первыми туда нельзя.

- [ ] **Step 7: Commit**

```bash
git add docs/user-guide/09-зачем-нужен-аккаунт.md apps/api/internal/modules/support/knowledge/ docs/curator-guide/11-бот-поддержки.md apps/api/internal/modules/support/registration_answer_test.go
git commit -m "docs(user-guide): раздел о том, что даёт аккаунт"
```

---

### Task 10: Сквозная проверка и выкатка

**Files:**
- Create: `e2e/support-widget.spec.ts`
- Modify: `openspec/changes/public-support-widget/tasks.md`

- [ ] **Step 1: Написать E2E-сценарий**

```ts
// Через прокси на 3070: на 3069 сессии нет, а виджету она не нужна — но
// остальной сценарий (переход в мастер, заявка) без неё разваливается.
test('гость спрашивает бота, зовёт человека и оставляет контакт', async ({ page }) => {
    await page.goto('http://localhost:3070/')

    await page.getByRole('button', { name: /задать вопрос/i }).click()
    await page.getByRole('textbox').fill('что даст регистрация?')
    await page.getByRole('button', { name: /отправить/i }).click()
    await expect(page.getByText(/дневник/i)).toBeVisible()

    await page.getByRole('button', { name: /позвать человека/i }).click()

    await page.getByLabel(/почт/i).fill('widget@example.com')
    await page.getByLabel(/обработку/i).check()
    await page.getByRole('button', { name: /сохранить/i }).click()
    await expect(page.getByText(/ответим/i)).toBeVisible()

    // Переписка переживает перезагрузку: токен лежит в localStorage.
    await page.reload()
    await page.getByRole('button', { name: /задать вопрос/i }).click()
    await expect(page.getByText('что даст регистрация?')).toBeVisible()
})
```

- [ ] **Step 2: Прогнать E2E явно на 3070**

Run: `E2E_BASE_URL=http://localhost:3070 npm run test:e2e -- support-widget`
Expected: PASS. Без явного адреса прогон уезжает на dev — он задан в `e2e/.env`.

- [ ] **Step 3: Прогнать проверки целостности**

Run: `node scripts/check-api-contract.mjs && node scripts/check-codebase-integrity.mjs`
Expected: без ошибок.

- [ ] **Step 4: Прогнать полный набор тестов**

Run: `cd apps/api && go test ./... && go test -tags=integration ./...`
Run: `cd apps/web && npx jest --coverage`
Run: `npm run test:e2e`
Expected: PASS; покрытие не ниже порогов.

- [ ] **Step 5: Проверить на dev**

1. вопрос из браузера → ответ бота по базе знаний;
2. вопрос вне базы знаний → честное «не знаю» и предложение человека;
3. вызов человека → разговор появился в очереди оператора рядом с телеграмными;
4. ответ оператора → виден в виджете после возврата на страницу;
5. переход в Telegram из виджета → в телеграмном разговоре видна та же заявка;
6. контакт из виджета → заявка создана с источником `bot`;
7. при выключенном `NEXT_PUBLIC_TELEGRAM_BOT` виджет работает, переход в Telegram не предлагается.

Наблюдения приложить к PR.

- [ ] **Step 6: Проверить исчерпанный потолок**

Временно снизить дневной потолок вызовов модели и убедиться, что оба канала отвечают честно и зовут человека, а не молчат и не падают.

- [ ] **Step 7: Выкатить на прод и повторить**

- [ ] **Step 8: Отметить задачи в предложении по факту проверенного**

- [ ] **Step 9: Commit**

```bash
git add e2e/support-widget.spec.ts openspec/changes/public-support-widget/tasks.md
git commit -m "test(e2e): разговор с ботом на сайте"
```

---

## Self-Review

**Покрытие спеки:**

| Требование | Задача |
|---|---|
| Разговор с ботом без аккаунта | 2, 4, 7, 8 |
| Ограничения публичного разговора | 4 |
| Переход в Telegram из виджета | 8 |
| Вызов человека из виджета | 5, 8 |
| Ответ оператора в веб-канале | 3 |
| Канал разговора | 1 |
| Единые правила ответа для всех каналов | 3, 9 |
| Неизменность кэшируемого префикса | 3 |
| Общий дневной потолок вызовов модели | 5 |
| База знаний отвечает на вопрос о регистрации | 9 |
| Заявка из разговора с ботом | 6 |

**Известные допущения, которые исполнитель обязан проверить перед началом:**

1. Сигнатура `IncomingMessage` (`support/types.go`) сейчас телеграмная — её придётся расширить полями `ConversationID` и `Channel`. Сверить с существующим вебхуком, чтобы не сломать его.
2. `LeadResolver` умеет только читать; расширять его до записи (задача 6) — решение, которое стоит перепроверить на месте: возможно, чище передать `*leads.Service` напрямую, как это сделано для других зависимостей.
3. Имена `LoadKnowledge`, `kb.Text()` (задача 9) названы по смыслу — сверить с `support/knowledge.go`.
4. Существует ли `apperrors.ErrConflict` и `apperrors.ErrTooManyRequests` — если нет, использовать существующие эквиваленты, а не заводить новые ради одного места.
