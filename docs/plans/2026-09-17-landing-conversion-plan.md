# Landing Conversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Переписать посадочную страницу под четыре проверяемых утверждения, развести вход и регистрацию, добавить вход по одноразовой ссылке без пароля и вторую точку захвата контакта.

**Architecture:** Новый механизм одноразовых ссылок входа живёт в модуле `auth` и опирается на собственную таблицу — он не переиспользует токены сброса пароля, потому что права у них разные. Создание аккаунта по ссылке проходит через тот же код записи согласий и тот же перенос заявки, что и обычная регистрация. Посадочная страница остаётся серверным компонентом; условный показ утверждения про фотографии еды приходит с сервера, а не из константы.

**Tech Stack:** Go 1.26 + Gin + database/sql (pgx/v5), PostgreSQL, Next.js 16 App Router, React 19, Tailwind v4, Zustand, Jest + RTL + MSW, Playwright.

**Spec:** `openspec/changes/landing-conversion/` — `proposal.md`, `design.md`, `specs/{landing-page,passwordless-signup,lead-capture,product-analytics}/spec.md`

## Global Constraints

- Язык интерфейса и всех пользовательских текстов — **русский**.
- Коммиты — conventional commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).
- Роль куратора в коде называется **`coordinator`**, не `curator`.
- Любой новый маршрут с идентификатором в пути обязан попасть в `protectedRoutes` (`apps/api/internal/router/authorization_matrix_test.go`), иначе сборка падает.
- Изменение маршрутов требует `UPDATE_GOLDEN=1 go test ./internal/router/` и просмотра диффа `internal/router/testdata/routes.golden`.
- `scripts/check-api-contract.mjs`: каждый путь `/api/...`, который зовёт фронтенд, обязан существовать в `routes.golden`.
- `scripts/check-codebase-integrity.mjs`: никаких неиспользуемых `NEXT_PUBLIC_*`; объявлять переменную только вместе с читающим её кодом.
- Локально и в E2E ходить через `scripts/dev-proxy.mjs` на **3070**. Открывать `:3069` напрямую — остаться без сессии.
- Порог покрытия: branches 79 %, functions 85 %, lines 87 %, statements 84 %.
- **Тест, вызывающий сбой базы, ломает операцию, а не убирает объект из схемы.** Изоляция через отдельную схему (`internal/testsupport`) не защищает от переименования или удаления таблицы: `search_path` проваливается в `public`, где лежат фикстуры `cmd/seed-e2e`, и запись уходит туда — молча и против чужих данных. Так уже случилось на задаче 4. Годный способ вызвать отказ вставки: `ALTER TABLE <таблица> ADD CONSTRAINT <имя> CHECK (false)` — операция падает, объект остаётся на месте.
- **Интеграционный набор прогоняется целиком, а не по правленым пакетам.** В проекте есть сторожа, срабатывающие на появление новой таблицы, и живут они в чужих пакетах: `TestErasureCoversSchema` (`internal/modules/account`) требует, чтобы таблица попала в стратегии удаления аккаунта, `TestSchemaMatchesGolden` (`internal/shared/database`) — чтобы снимок схемы знал о ней. Оба падали три задачи подряд незамеченными, потому что прогонялись только правленые пакеты. После любой миграции:
  ```
  export TEST_DATABASE_URL='postgres://burcev:burcev@localhost:5432/burcev_test?sslmode=disable'
  cd apps/api && go test -tags=integration ./...
  ```
  Снимок схемы обновляется `UPDATE_GOLDEN=1 go test -tags=integration ./internal/shared/database/`, диff просматривается.
- Пороговые значения и формулировки согласий проверяет `consentWording.test.ts`: текст обязан называть параметры тела и упоминать сведения о здоровье, согласие на связь остаётся отдельным.
- Подмены скрывают дефекты: там, где проверка касается того, что попало в базу, писать интеграционный тест на живой базе (`//go:build integration`, `internal/testsupport`), а не sqlmock.
- **Интеграционный тест требует двух вещей сразу: тега и базы.** Без `-tags=integration` файл не попадает в сборку; без `TEST_DATABASE_URL` тест делает `t.Skip` (`internal/testsupport/schema.go:34`) — и `go test` в обоих случаях печатает `ok`. Пропущенный тест не является пройденным: отчёт обязан показывать строку `--- PASS: <имя теста>`, а не только `ok <пакет>`. Команда целиком:
  ```
  export TEST_DATABASE_URL='postgres://burcev:burcev@localhost:5432/burcev_test?sslmode=disable'
  cd apps/api && go test -tags=integration ./<пакет>/ -run <Тест> -v
  ```

---

### Task 1: Таблица одноразовых ссылок входа

**Files:**
- Create: `apps/api/migrations/073_magic_links_up.sql`
- Create: `apps/api/migrations/073_magic_links_down.sql`
- Test: `apps/api/internal/shared/database/migrator_test.go` (существующий прогон миграций)

**Interfaces:**
- Consumes: ничего.
- Produces: таблица `magic_links(id UUID, token_hash TEXT UNIQUE, email CITEXT/TEXT, user_id BIGINT NULL, consents JSONB NULL, expires_at TIMESTAMPTZ, consumed_at TIMESTAMPTZ NULL, ip_address TEXT, user_agent TEXT, created_at TIMESTAMPTZ)`; столбец `users.password_hash` становится NULL-допустимым.

- [ ] **Step 1: Написать миграцию вверх**

```sql
-- Migration: Magic links
-- Version: 073
--
-- Вход по одноразовой ссылке — отдельный механизм, а не переиспользование
-- сброса пароля. Токен сброса даёт право сменить пароль, токен входа — право
-- на сессию: общий механизм означал бы, что ошибка в одном становится дырой в
-- другом, а сроки жизни у них обязаны различаться.

CREATE TABLE IF NOT EXISTS magic_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Хранится только хэш: ссылка из письма не должна восстанавливаться из базы.
  token_hash TEXT NOT NULL UNIQUE,

  -- Адрес, на который ссылка выдана. Аккаунта на него может ещё не быть —
  -- тогда переход по ссылке его создаст.
  email TEXT NOT NULL,
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,

  -- Согласия, данные при запросе ссылки. Нужны только когда аккаунта нет:
  -- согласие должно быть дано до обработки, а обработка начинается с письма.
  consents JSONB,

  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,

  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Погашение ищет по хэшу и проверяет срок; уборка ходит по сроку.
CREATE INDEX IF NOT EXISTS idx_magic_links_expires ON magic_links(expires_at);
CREATE INDEX IF NOT EXISTS idx_magic_links_email ON magic_links(email);

-- Аккаунт, созданный по ссылке, живёт без пароля. Существующие аккаунты
-- не затрагиваются: у них хэш есть.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

COMMENT ON TABLE magic_links IS 'Одноразовые ссылки входа, живут 15 минут';
COMMENT ON COLUMN magic_links.consents IS 'Согласия, данные при запросе; применяются при создании аккаунта';
```

- [ ] **Step 2: Написать миграцию вниз**

```sql
-- Откат. Аккаунты без пароля после отката смогут войти только через
-- восстановление пароля, поэтому откат после их появления требует рассылки
-- приглашения задать пароль — см. design.md, Migration Plan.
DROP INDEX IF EXISTS idx_magic_links_email;
DROP INDEX IF EXISTS idx_magic_links_expires;
DROP TABLE IF EXISTS magic_links;

UPDATE users SET password_hash = '' WHERE password_hash IS NULL;
ALTER TABLE users ALTER COLUMN password_hash SET NOT NULL;
```

- [ ] **Step 3: Прогнать миграции на чистой базе**

Run: `export TEST_DATABASE_URL='postgres://burcev:burcev@localhost:5432/burcev_test?sslmode=disable' && cd apps/api && go test -tags=integration ./internal/shared/database/ -v`
Expected: PASS с видимыми строками `--- PASS: TestMigrationsApplyToCleanDatabase` и `--- PASS: TestMigrationsRollBackInReverse` — они и прогоняют мигратор через файлы 073. Без тега эти тесты в сборку не попадают, и `go test` печатает `ok`, ничего не проверив.

- [ ] **Step 4: Проверить откат вручную**

Run: применить 073 вверх, затем вниз на локальной базе; убедиться, что `users.password_hash` снова `NOT NULL`.
Expected: обе операции без ошибок.

- [ ] **Step 5: Commit**

```bash
git add apps/api/migrations/073_magic_links_up.sql apps/api/migrations/073_magic_links_down.sql
git commit -m "feat(auth): таблица одноразовых ссылок входа"
```

---

### Task 2: Выдача ссылки с неразличимым ответом

**Files:**
- Create: `apps/api/internal/modules/auth/magiclink.go`
- Create: `apps/api/internal/modules/auth/magiclink_test.go`
- Modify: `apps/api/internal/modules/auth/handler.go` (рядом с `RegisterRequest`, строка 90)

**Interfaces:**
- Consumes: `magic_links` из задачи 1; `ConsentsInput` из `auth/handler.go:103`.
- Produces:
  - `func (s *Service) RequestMagicLink(ctx context.Context, email string, consents *ConsentsInput, ip, ua string) error`
  - `func (h *Handler) RequestMagicLink(c *gin.Context)` — обработчик `POST /api/v1/auth/magic-link/request`
  - `const MagicLinkTTL = 15 * time.Minute`

- [ ] **Step 1: Написать падающий тест на неразличимость ответа**

```go
// Ответ обязан совпадать для существующего и несуществующего адреса, иначе
// эндпоинт превращается в проверялку наличия аккаунта.
func TestRequestMagicLinkResponseDoesNotRevealAccount(t *testing.T) {
	r, _, mock := setupAuthHandler(t)

	mock.ExpectQuery(`SELECT id FROM users WHERE email`).
		WithArgs("known@example.com").
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(int64(7)))
	mock.ExpectExec(`INSERT INTO magic_links`).
		WillReturnResult(sqlmock.NewResult(1, 1))

	known := post(r, "/auth/magic-link/request",
		`{"email":"known@example.com","consents":{"terms_of_service":true,"privacy_policy":true,"data_processing":true}}`)

	mock.ExpectQuery(`SELECT id FROM users WHERE email`).
		WithArgs("stranger@example.com").
		WillReturnError(sql.ErrNoRows)
	mock.ExpectExec(`INSERT INTO magic_links`).
		WillReturnResult(sqlmock.NewResult(1, 1))

	unknown := post(r, "/auth/magic-link/request",
		`{"email":"stranger@example.com","consents":{"terms_of_service":true,"privacy_policy":true,"data_processing":true}}`)

	assert.Equal(t, known.Code, unknown.Code)
	assert.Equal(t, known.Body.String(), unknown.Body.String())
}
```

- [ ] **Step 2: Написать падающий тест на обязательные согласия**

```go
// Согласие должно быть дано до обработки, а обработка начинается с отправки
// письма на указанный адрес. Без согласий ссылка не выдаётся и письма нет.
func TestRequestMagicLinkRequiresConsents(t *testing.T) {
	r, _, _ := setupAuthHandler(t)

	w := post(r, "/auth/magic-link/request",
		`{"email":"someone@example.com","consents":{"terms_of_service":false,"privacy_policy":true,"data_processing":true}}`)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}
```

- [ ] **Step 3: Запустить тесты и убедиться, что они падают**

Run: `cd apps/api && go test ./internal/modules/auth/ -run TestRequestMagicLink -v`
Expected: FAIL — `undefined: RequestMagicLink`.

- [ ] **Step 4: Реализовать выдачу**

```go
// MagicLinkTTL — сколько живёт ссылка входа. Достаточно дойти до почты, мало
// для письма, забытого в общем ящике.
const MagicLinkTTL = 15 * time.Minute

// RequestMagicLink выдаёт одноразовую ссылку входа на адрес.
//
// Ответ не зависит от того, есть ли аккаунт: различие превратило бы эндпоинт в
// проверялку наличия аккаунта. Различается только текст письма.
func (s *Service) RequestMagicLink(ctx context.Context, email string, consents *ConsentsInput, ip, ua string) error {
	if consents == nil || !consents.TermsOfService || !consents.PrivacyPolicy || !consents.DataProcessing {
		return apperrors.ErrValidation
	}

	var userID *int64
	var existing int64
	switch err := s.db.QueryRowContext(ctx,
		`SELECT id FROM users WHERE email = $1`, email).Scan(&existing); {
	case err == nil:
		userID = &existing
	case errors.Is(err, sql.ErrNoRows):
		// Аккаунта нет — ссылка его создаст.
	default:
		return fmt.Errorf("look up account: %w", err)
	}

	token, hash, err := newMagicToken()
	if err != nil {
		return err
	}

	// Согласия нужны только когда аккаунта нет: существующему их не
	// перезаписывают, это вход, а не регистрация.
	var payload any
	if userID == nil {
		payload, err = json.Marshal(consents)
		if err != nil {
			return fmt.Errorf("encode consents: %w", err)
		}
	}

	if _, err := s.db.ExecContext(ctx,
		`INSERT INTO magic_links (token_hash, email, user_id, consents, expires_at, ip_address, user_agent)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		hash, email, userID, payload, time.Now().Add(MagicLinkTTL), ip, ua); err != nil {
		return fmt.Errorf("store magic link: %w", err)
	}

	return s.mail.SendMagicLink(ctx, email, token, userID != nil)
}
```

- [ ] **Step 5: Реализовать обработчик с единым ответом**

```go
// MagicLinkRequest — тело запроса ссылки входа.
type MagicLinkRequest struct {
	Email    string         `json:"email" binding:"required,email"`
	Consents *ConsentsInput `json:"consents"`
}

// RequestMagicLink handles POST /api/v1/auth/magic-link/request.
func (h *Handler) RequestMagicLink(c *gin.Context) {
	var req MagicLinkRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "Проверьте адрес почты")
		return
	}

	err := h.service.RequestMagicLink(c.Request.Context(), req.Email, req.Consents,
		c.ClientIP(), c.Request.UserAgent())
	switch {
	case err == nil, errors.Is(err, apperrors.ErrNotFound):
		// Оба случая отвечают одинаково: см. RequestMagicLink.
	case errors.Is(err, apperrors.ErrValidation):
		response.Error(c, http.StatusBadRequest,
			"Нужно согласие на условия, политику конфиденциальности и обработку данных")
		return
	case errors.Is(err, apperrors.ErrFeatureUnavailable):
		response.FeatureUnavailable(c, "Отправка почты сейчас недоступна — войдите по паролю")
		return
	default:
		h.log.Error("Failed to issue magic link", "error", err)
		response.InternalError(c, "Не удалось отправить ссылку")
		return
	}

	response.SuccessWithMessage(c, http.StatusOK,
		"Если такой адрес существует, мы отправили на него ссылку для входа", nil)
}
```

- [ ] **Step 6: Запустить тесты и убедиться, что они проходят**

Run: `cd apps/api && go test ./internal/modules/auth/ -run TestRequestMagicLink -v`
Expected: PASS оба теста.

- [ ] **Step 7: Commit**

```bash
git add apps/api/internal/modules/auth/magiclink.go apps/api/internal/modules/auth/magiclink_test.go apps/api/internal/modules/auth/handler.go
git commit -m "feat(auth): выдача одноразовой ссылки входа"
```

---
### Task 3: Погашение ссылки — срок, одноразовость, сессия

**Files:**
- Modify: `apps/api/internal/modules/auth/magiclink.go`
- Modify: `apps/api/internal/modules/auth/magiclink_test.go`
- Create: `apps/api/internal/modules/auth/magiclink_integration_test.go`

**Interfaces:**
- Consumes: `MagicLinkTTL`, таблица `magic_links` (задачи 1–2); `*LoginResult` — существующий тип из `auth/service.go:144`.
- Produces:
  - `func (s *Service) ConsumeMagicLink(ctx context.Context, token, leadToken, ip, ua string) (*LoginResult, bool, error)` — второе значение: `true`, если аккаунт был создан этим вызовом.
  - `func (h *Handler) ConsumeMagicLink(c *gin.Context)` — обработчик `POST /api/v1/auth/magic-link/consume`.

- [ ] **Step 1: Написать падающие тесты на четыре исхода погашения**

```go
func TestConsumeMagicLinkRejectsExpired(t *testing.T) {
	r, _, mock := setupAuthHandler(t)
	expectLinkLookup(mock, linkRow{userID: 7, expiresAt: time.Now().Add(-time.Minute)})

	w := post(r, "/auth/magic-link/consume", `{"token":"whatever"}`)

	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.Contains(t, w.Body.String(), "запросите новую")
}

func TestConsumeMagicLinkRejectsAlreadyUsed(t *testing.T) {
	r, _, mock := setupAuthHandler(t)
	used := time.Now().Add(-time.Minute)
	expectLinkLookup(mock, linkRow{userID: 7, expiresAt: time.Now().Add(time.Minute), consumedAt: &used})

	w := post(r, "/auth/magic-link/consume", `{"token":"whatever"}`)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

// Подделанный токен обязан отвечать ровно тем же, чем истёкший: иначе разница
// говорит, что такой токен когда-то выдавался.
func TestConsumeMagicLinkForgedLooksLikeExpired(t *testing.T) {
	r, _, mock := setupAuthHandler(t)
	mock.ExpectQuery(`FROM magic_links`).WillReturnError(sql.ErrNoRows)
	forged := post(r, "/auth/magic-link/consume", `{"token":"forged"}`)

	r2, _, mock2 := setupAuthHandler(t)
	expectLinkLookup(mock2, linkRow{userID: 7, expiresAt: time.Now().Add(-time.Minute)})
	expired := post(r2, "/auth/magic-link/consume", `{"token":"stale"}`)

	assert.Equal(t, expired.Code, forged.Code)
	assert.Equal(t, expired.Body.String(), forged.Body.String())
}
```

- [ ] **Step 2: Написать интеграционный тест одноразовости на живой базе**

```go
//go:build integration

// Одноразовость проверяется на настоящей базе намеренно. На sqlmock «второй
// переход не выдаёт сессию» проходит и тогда, когда погашение написано как
// чтение с последующей записью без условия: подмена не спотыкается на гонке,
// а именно она здесь и опасна — две вкладки, открытые из одного письма.
func TestConsumeMagicLinkIsSingleUseUnderConcurrency(t *testing.T) {
	db := testsupport.DB(t)
	svc := newServiceForTest(t, db)

	token := seedMagicLink(t, db, "concurrent@example.com", time.Now().Add(time.Minute))

	results := make(chan error, 2)
	for i := 0; i < 2; i++ {
		go func() {
			_, _, err := svc.ConsumeMagicLink(context.Background(), token, "", "127.0.0.1", "test")
			results <- err
		}()
	}

	var ok, failed int
	for i := 0; i < 2; i++ {
		if err := <-results; err == nil {
			ok++
		} else {
			failed++
		}
	}

	assert.Equal(t, 1, ok, "ровно один переход обязан выдать сессию")
	assert.Equal(t, 1, failed)
}
```

- [ ] **Step 3: Запустить тесты и убедиться, что они падают**

Run: `cd apps/api && go test ./internal/modules/auth/ -run TestConsumeMagicLink -v`
Expected: FAIL — `undefined: ConsumeMagicLink`.

- [ ] **Step 4: Реализовать погашение одним условным запросом**

```go
// ConsumeMagicLink обменивает ссылку на сессию.
//
// Погашение — один запрос с условием, а не чтение с последующей записью: две
// вкладки, открытые из одного письма, обязаны разойтись на уровне базы.
func (s *Service) ConsumeMagicLink(ctx context.Context, token, leadToken, ip, ua string) (*LoginResult, bool, error) {
	hash := hashMagicToken(token)

	var linkID string
	var email string
	var userID *int64
	var consents []byte
	err := s.db.QueryRowContext(ctx, `
		UPDATE magic_links
		   SET consumed_at = NOW()
		 WHERE token_hash = $1
		   AND consumed_at IS NULL
		   AND expires_at > NOW()
		RETURNING id, email, user_id, consents`, hash).
		Scan(&linkID, &email, &userID, &consents)
	if errors.Is(err, sql.ErrNoRows) {
		// Истёкшая, использованная и поддельная ссылка неразличимы наружу.
		return nil, false, apperrors.ErrInvalidToken
	}
	if err != nil {
		return nil, false, fmt.Errorf("consume magic link: %w", err)
	}

	if userID != nil {
		result, err := s.issueSession(ctx, *userID, ip, ua)
		return result, false, err
	}

	result, err := s.createAccountFromMagicLink(ctx, email, consents, leadToken, ip, ua)
	return result, true, err
}
```

- [ ] **Step 5: Реализовать обработчик с единым текстом отказа**

```go
// ConsumeMagicLink handles POST /api/v1/auth/magic-link/consume.
func (h *Handler) ConsumeMagicLink(c *gin.Context) {
	var req struct {
		Token     string `json:"token" binding:"required"`
		LeadToken string `json:"lead_token"`
		VisitorID string `json:"visitor_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "Ссылка не подходит — запросите новую")
		return
	}

	// Токен заявки мог приехать cookie: путь через внешнего провайдера уже
	// так делает (leads/handler.go:59), и вход по ссылке из письма — тот же
	// случай, когда наш JavaScript до перехода не доживает.
	leadToken := req.LeadToken
	if leadToken == "" {
		if fromCookie, err := c.Cookie(leads.LeadCookieName); err == nil {
			leadToken = fromCookie
		}
	}

	result, created, err := h.service.ConsumeMagicLink(c.Request.Context(), req.Token,
		leadToken, c.ClientIP(), c.Request.UserAgent())
	switch {
	case err == nil:
	case errors.Is(err, apperrors.ErrInvalidToken):
		response.Error(c, http.StatusBadRequest, "Ссылка не подходит — запросите новую")
		return
	default:
		h.log.Error("Failed to consume magic link", "error", err)
		response.InternalError(c, "Не удалось войти")
		return
	}

	h.setSessionCookies(c, result)
	response.Success(c, http.StatusOK, gin.H{"user": result.User, "created": created})
}
```

- [ ] **Step 6: Запустить тесты**

Run: `cd apps/api && go test ./internal/modules/auth/ -run TestConsumeMagicLink -v`
Expected: PASS.

Run: `cd apps/api && go test -tags=integration ./internal/modules/auth/ -run TestConsumeMagicLinkIsSingleUse -v`
Expected: PASS — ровно один из двух переходов выдаёт сессию.

- [ ] **Step 7: Commit**

```bash
git add apps/api/internal/modules/auth/magiclink.go apps/api/internal/modules/auth/magiclink_test.go apps/api/internal/modules/auth/magiclink_integration_test.go
git commit -m "feat(auth): погашение ссылки входа одним условным запросом"
```

---

### Task 4: Создание аккаунта по ссылке — согласия и перенос заявки

**Files:**
- Modify: `apps/api/internal/modules/auth/magiclink.go`
- Modify: `apps/api/internal/modules/auth/magiclink_integration_test.go`
- Reference: `apps/api/internal/modules/auth/service.go:200-218` (запись согласий), `apps/api/internal/modules/leads/service.go:199` (`ClaimInto`)

**Interfaces:**
- Consumes: `ConsumeMagicLink` (задача 3); `leads.Service.ClaimInto(ctx, token, userID) error`.
- Produces: `func (s *Service) createAccountFromMagicLink(ctx context.Context, email string, consents []byte, leadToken, ip, ua string) (*LoginResult, error)`.

- [ ] **Step 1: Написать падающий интеграционный тест на согласия**

```go
//go:build integration

// Обычная регистрация пишет согласия в user_consents (service.go:200-218).
// Путь в обход неё дал бы пользователей без единой записи о согласии — на
// sqlmock это незаметно, потому что подмена не хранит строк.
func TestMagicLinkAccountRecordsConsents(t *testing.T) {
	db := testsupport.DB(t)
	svc := newServiceForTest(t, db)

	token := seedMagicLinkWithConsents(t, db, "fresh@example.com",
		`{"terms_of_service":true,"privacy_policy":true,"data_processing":true,"marketing":false}`)

	result, created, err := svc.ConsumeMagicLink(context.Background(), token, "", "127.0.0.1", "test")
	require.NoError(t, err)
	require.True(t, created)

	rows, err := db.Query(
		`SELECT consent_type, granted FROM user_consents WHERE user_id = $1 ORDER BY consent_type`,
		result.User.ID)
	require.NoError(t, err)
	defer rows.Close()

	granted := map[string]bool{}
	for rows.Next() {
		var ctype string
		var ok bool
		require.NoError(t, rows.Scan(&ctype, &ok))
		granted[ctype] = ok
	}

	assert.True(t, granted["terms_of_service"])
	assert.True(t, granted["privacy_policy"])
	assert.True(t, granted["data_processing"])
	assert.False(t, granted["marketing"])
}
```

- [ ] **Step 2: Написать падающий тест на подтверждённый адрес и перенос заявки**

```go
//go:build integration

func TestMagicLinkAccountIsVerifiedAndClaimsLead(t *testing.T) {
	db := testsupport.DB(t)
	svc := newServiceForTest(t, db)

	leadToken := seedLead(t, db, "fresh2@example.com", 178.0, 82.5)
	token := seedMagicLinkWithConsents(t, db, "fresh2@example.com",
		`{"terms_of_service":true,"privacy_policy":true,"data_processing":true}`)

	result, created, err := svc.ConsumeMagicLink(context.Background(), token, leadToken, "127.0.0.1", "test")
	require.NoError(t, err)
	require.True(t, created)

	// Адрес подтверждён самим переходом по ссылке — второго письма не нужно.
	var verified bool
	require.NoError(t, db.QueryRow(
		`SELECT email_verified FROM users WHERE id = $1`, result.User.ID).Scan(&verified))
	assert.True(t, verified)

	// Рост и вес из заявки не спрашиваются второй раз.
	var height, weight *float64
	require.NoError(t, db.QueryRow(
		`SELECT height_cm, weight_kg FROM user_profiles WHERE user_id = $1`,
		result.User.ID).Scan(&height, &weight))
	require.NotNil(t, height)
	assert.InDelta(t, 178.0, *height, 0.01)
	require.NotNil(t, weight)
	assert.InDelta(t, 82.5, *weight, 0.01)
}
```

- [ ] **Step 3: Запустить тесты и убедиться, что они падают**

Run: `cd apps/api && go test -tags=integration ./internal/modules/auth/ -run TestMagicLinkAccount -v`
Expected: FAIL — `undefined: createAccountFromMagicLink`.

- [ ] **Step 4: Реализовать создание аккаунта**

```go
// createAccountFromMagicLink заводит аккаунт без пароля.
//
// Согласия берутся из ссылки, а не из этого запроса: они были даны до отправки
// письма, потому что обработка данных начинается с самого письма.
func (s *Service) createAccountFromMagicLink(
	ctx context.Context, email string, consents []byte, leadToken, ip, ua string,
) (*LoginResult, error) {
	var parsed ConsentsInput
	if len(consents) > 0 {
		if err := json.Unmarshal(consents, &parsed); err != nil {
			return nil, fmt.Errorf("decode stored consents: %w", err)
		}
	}

	// Адрес подтверждён самим фактом перехода по ссылке, отправленной на него.
	user, err := s.createUser(ctx, email, nil, "", true)
	if err != nil {
		return nil, err
	}

	// Тот же код, что и у обычной регистрации: расхождение здесь означало бы
	// пользователей без записей о согласии.
	s.storeConsents(ctx, user.ID, &parsed, ip, ua)

	if leadToken != "" && s.leads != nil {
		if err := s.leads.ClaimInto(ctx, leadToken, user.ID); err != nil {
			// Заявка не перенеслась — человек введёт параметры заново. Это
			// потеря удобства, но не повод отказать во входе.
			s.log.Info("Magic link sign-up could not claim lead", "error", err)
		}
	}

	return s.issueSession(ctx, user.ID, ip, ua)
}
```

- [ ] **Step 5: Вынести запись согласий из `Register` в общий метод**

Взять тело цикла из `auth/service.go:200-218` и оформить как `func (s *Service) storeConsents(ctx context.Context, userID int64, consents *ConsentsInput, ip, ua string)`; вызвать его из `Register` вместо встроенного цикла. Поведение не меняется — меняется только место.

- [ ] **Step 6: Запустить тесты**

Run: `cd apps/api && go test -tags=integration ./internal/modules/auth/ -run TestMagicLinkAccount -v`
Expected: PASS оба.

Run: `cd apps/api && go test ./internal/modules/auth/`
Expected: PASS — существующие тесты регистрации не сломаны выносом `storeConsents`.

- [ ] **Step 7: Commit**

```bash
git add apps/api/internal/modules/auth/
git commit -m "feat(auth): аккаунт по ссылке пишет согласия и подхватывает заявку"
```

---
### Task 5: Вход по паролю не выдаёт беспарольный аккаунт и не пускает по пустой строке

**Files:**
- Modify: `apps/api/internal/modules/auth/service.go` (метод `Login`)
- Modify: `apps/api/internal/modules/auth/service_test.go`
- Create: `apps/api/internal/modules/auth/login_passwordless_integration_test.go`

**Interfaces:**
- Consumes: столбец `users.password` — он уже NULL-допустим с миграции 049 (внешние провайдеры создают аккаунт с `password = NULL`, `oauth_service.go:126-128`). Миграция для этого **не нужна**.
- Produces: поведение `Login` при пустом и отсутствующем сохранённом пароле. Новых имён не вводит.

**Что здесь на самом деле** (план изначально описывал это неверно, механизм установлен по коду и проверен на живой базе):

`Login` читает пароль так:

```go
var hashedPassword string
err := s.db.QueryRowContext(ctx, query, email).Scan(..., &hashedPassword, ...)
```

Дальше идёт ветка миграции старых plaintext-паролей в bcrypt:

```go
if err := bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(password)); err != nil {
    if strings.HasPrefix(hashedPassword, "$2") {
        return nil, ErrInvalidCredentials
    }
    if hashedPassword != password {
        return nil, ErrInvalidCredentials
    }
    // сюда — значит вход удался, пароль мигрируется в bcrypt
}
```

Отсюда два дефекта.

**Дефект A — пустая строка пускает внутрь.** При `password = ''` в базе: bcrypt падает, префикса `$2` нет, `'' != ''` ложно — управление проваливается вниз, в «успех». Любой, кто пришлёт пустой пароль на такой аккаунт, войдёт. Сегодня недостижимо: пустую строку не пишет ни один из трёх путей записи (`reset_service.go:313`, `service.go:284`, `service.go:522`) — проверено. Но это мина: любая будущая миграция или правка, положившая пустую строку, превращает её в живой обход.

**Дефект B — NULL даёт не тот класс ответа.** `Scan` NULL в `string` возвращает `converting NULL to string is unsupported` (проверено на живой базе). `Login` возвращает обёрнутую ошибку, не `ErrInvalidCredentials`, — то есть внутреннюю ошибку вместо «неверный пароль». По коду ответа посторонний отличает беспарольный аккаунт от обычного. После этого плана таких аккаунтов станет много: их создаёт вход по ссылке.

- [ ] **Step 1: Написать падающий тест на дефект B**

```go
// Аккаунт без пароля не должен выдавать себя ответом: иначе вход по паролю
// становится способом узнать, каким образом человек регистрировался. Таких
// аккаунтов в системе уже два вида — заведённые внешним провайдером и, после
// этого изменения, заведённые по ссылке входа.
func TestLoginIntoPasswordlessAccountLooksLikeWrongPassword(t *testing.T) {
	svc, mock, cleanup := setupTestService(t)
	defer cleanup()

	expectUserRow(mock, "passwordless@example.com", nil)
	_, errNoPassword := svc.Login(context.Background(),
		"passwordless@example.com", "guess", "ip", "ua", false)

	expectUserRow(mock, "withpass@example.com", strPtr(bcryptOf(t, "correct horse")))
	_, errWrongPassword := svc.Login(context.Background(),
		"withpass@example.com", "guess", "ip", "ua", false)

	require.Error(t, errNoPassword)
	require.Error(t, errWrongPassword)
	assert.True(t, errors.Is(errNoPassword, apperrors.ErrInvalidCredentials),
		"беспарольный аккаунт обязан отвечать тем же, чем неверный пароль, получено: %v", errNoPassword)
	assert.True(t, errors.Is(errWrongPassword, apperrors.ErrInvalidCredentials))
}
```

`expectUserRow` — вспомогательная функция теста: ставит ожидание запроса пользователя, отдавая `password` как `nil` или как значение. Столбцы и их порядок взять из настоящего запроса в `Login`, не выдумывать.

- [ ] **Step 2: Написать падающий тест на дефект A**

```go
// Пустая строка в базе не пароль, а отсутствие пароля. Ветка миграции
// plaintext-пароля в bcrypt сравнивает сохранённое значение с присланным
// напрямую, и на двух пустых строках это сравнение истинно — то есть вход
// удаётся без пароля вовсе.
func TestLoginRefusesEmptyStoredPassword(t *testing.T) {
	svc, mock, cleanup := setupTestService(t)
	defer cleanup()

	empty := ""

	expectUserRow(mock, "empty@example.com", &empty)
	_, errEmptyGuess := svc.Login(context.Background(), "empty@example.com", "", "ip", "ua", false)

	expectUserRow(mock, "empty@example.com", &empty)
	_, errAnyGuess := svc.Login(context.Background(), "empty@example.com", "что угодно", "ip", "ua", false)

	assert.True(t, errors.Is(errEmptyGuess, apperrors.ErrInvalidCredentials),
		"пустой пароль к пустому сохранённому значению обязан быть отказом, получено: %v", errEmptyGuess)
	assert.True(t, errors.Is(errAnyGuess, apperrors.ErrInvalidCredentials))
}

// Миграция настоящего plaintext-пароля должна продолжать работать: этот тест
// охраняет починку от того, чтобы она заодно сломала легаси-вход.
func TestLoginStillMigratesRealPlaintextPassword(t *testing.T) {
	svc, mock, cleanup := setupTestService(t)
	defer cleanup()

	stored := "legacy-plaintext"
	expectUserRow(mock, "legacy@example.com", &stored)
	mock.ExpectExec(`UPDATE users SET password`).WillReturnResult(sqlmock.NewResult(0, 1))

	result, err := svc.Login(context.Background(), "legacy@example.com", "legacy-plaintext", "ip", "ua", false)

	require.NoError(t, err)
	require.NotNil(t, result)
	require.NoError(t, mock.ExpectationsWereMet())
}
```

- [ ] **Step 3: Запустить тесты и убедиться, что они падают**

Run: `cd apps/api && go test ./internal/modules/auth/ -run 'TestLoginIntoPasswordlessAccount|TestLoginRefusesEmptyStoredPassword|TestLoginStillMigratesRealPlaintextPassword' -v`
Expected: первые два FAIL (дефект B — падение `Scan`; дефект A — вход удаётся и ошибки нет), третий PASS.

- [ ] **Step 4: Читать пароль как значение, которого может не быть**

```go
	var storedPassword sql.NullString
```

и в `Scan` передавать `&storedPassword` вместо `&hashedPassword`.

- [ ] **Step 5: Отказывать до сравнения, когда сравнивать не с чем**

Сразу после `Scan` и до всякой проверки пароля:

```go
	// Пароля нет вовсе (аккаунт заведён внешним провайдером или ссылкой входа)
	// либо сохранена пустая строка. И то и другое — не пароль, а его
	// отсутствие, и отвечать на это надо тем же, чем на неверный пароль:
	// разница в ответе сообщила бы, каким способом человек регистрировался.
	//
	// Сравнение с фиктивным хэшем — чтобы отказ стоил столько же времени,
	// сколько неверный пароль; разница в скорости говорит то же самое, что
	// разница в тексте.
	if !storedPassword.Valid || storedPassword.String == "" {
		_ = bcrypt.CompareHashAndPassword([]byte(dummyBcryptHash), []byte(password))
		return nil, fmt.Errorf("Login.NoPassword: %w", apperrors.ErrInvalidCredentials)
	}
```

Константу объявить рядом с методом:

```go
// Хэш, с которым сравнивают, когда сравнивать не с чем: он нужен только
// затем, чтобы отказ беспарольному аккаунту занимал столько же времени,
// сколько неверный пароль.
const dummyBcryptHash = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy"
```

- [ ] **Step 6: Закрыть саму ветку миграции от пустых значений**

Дальше по методу заменить обращения к `hashedPassword` на `storedPassword.String`. Ветка миграции plaintext после шага 5 уже недостижима с пустым сохранённым значением, но присланный пустой пароль в ней сравнивается с непустым сохранённым и честно не совпадёт. Убедись, что условие `strings.HasPrefix(storedPassword.String, "$2")` сохранено: оно и отделяет настоящий bcrypt-хэш от легаси-значения.

- [ ] **Step 7: Запустить тесты**

Run: `cd apps/api && go test ./internal/modules/auth/ -run TestLogin -v`
Expected: PASS все три, включая тест миграции legacy-пароля.

- [ ] **Step 8: Написать интеграционный тест на живой базе**

```go
//go:build integration

// Проверяется на живой базе намеренно: оба дефекта — про то, что приходит из
// базы, а sqlmock отдаёт ровно то, что ему сказали отдать, и про NULL в
// столбце не знает ничего. Дефект B и обнаружился только на живой базе.
func TestLoginAgainstRealPasswordlessRows(t *testing.T) {
	db := testsupport.DB(t)
	svc := newServiceForTest(t, db)

	nullID := seedUser(t, db, "null@example.com", nil)
	emptyID := seedUser(t, db, "empty@example.com", strPtr(""))
	require.NotZero(t, nullID)
	require.NotZero(t, emptyID)

	_, errNull := svc.Login(context.Background(), "null@example.com", "", "ip", "ua", false)
	_, errEmpty := svc.Login(context.Background(), "empty@example.com", "", "ip", "ua", false)

	assert.True(t, errors.Is(errNull, apperrors.ErrInvalidCredentials),
		"NULL-пароль обязан давать отказ, а не внутреннюю ошибку: %v", errNull)
	assert.True(t, errors.Is(errEmpty, apperrors.ErrInvalidCredentials),
		"пустой пароль обязан давать отказ, а не вход: %v", errEmpty)
}
```

- [ ] **Step 9: Прогнать интеграционный тест**

Run:
```
export TEST_DATABASE_URL='postgres://burcev:burcev@localhost:5432/burcev_test?sslmode=disable'
cd apps/api && go test -tags=integration ./internal/modules/auth/ -run TestLoginAgainstRealPasswordlessRows -v
```
Expected: `--- PASS: TestLoginAgainstRealPasswordlessRows`. Без тега и без переменной тест не выполняется, а `go test` всё равно печатает `ok` — в отчёте должна быть строка `--- PASS:`, а не `ok`.

- [ ] **Step 10: Прогнать весь модуль**

Run: `cd apps/api && go test ./internal/modules/auth/`
Expected: PASS — существующий вход по паролю и вход через внешнего провайдера не затронуты.

- [ ] **Step 11: Commit**

```bash
git add apps/api/internal/modules/auth/
git commit -m "fix(auth): пустой и отсутствующий пароль дают отказ, а не вход

Login читал пароль в string, поэтому NULL ронял Scan и возвращал
внутреннюю ошибку вместо неверных учётных данных — по классу ответа
беспарольный аккаунт был отличим от обычного.

Хуже: ветка миграции plaintext-пароля сравнивала сохранённое значение с
присланным напрямую, и на двух пустых строках сравнение истинно. Аккаунт
с пустой строкой в password пускал внутрь по пустому паролю. Сегодня
недостижимо — пустую строку не пишет ни один путь, — но вход по ссылке
добавляет беспарольные аккаунты, и мину надо снять до этого."
```

---

### Task 5а: Беспарольный пользователь может удалить свой аккаунт

**Files:**
- Modify: `apps/api/internal/modules/account/service.go` (`RequestDeletion`)
- Modify: `apps/api/internal/modules/account/handler.go`
- Modify: `apps/api/internal/modules/auth/handler.go` (отдать признак наличия пароля)
- Modify: `apps/web/src/features/settings/components/SettingsPrivacy.tsx`
- Test: `apps/api/internal/modules/account/deletion_passwordless_integration_test.go`, `apps/web/src/features/settings/components/__tests__/SettingsPrivacy.test.tsx`

**Почему эта задача существует.** Задача 5 починила `RequestDeletion` так, что он больше не падает на беспарольном аккаунте. Но форма удаления держит кнопку заблокированной условием `!password` (`SettingsPrivacy.tsx:212`), а пароля у такого человека нет. То есть удаление данных для него по-прежнему недоступно — сломано не пятисоткой, а неактивной кнопкой.

Владелец продукта выбрал: **необратимое действие подтверждается кодом с почты**, а не одной действующей сессией. Причина — асимметрия, которую нашло ревью: для аккаунта с паролем угнанной сессии мало, а для беспарольного её хватало бы.

**Почему код, а не ссылка.** Человек стоит в настройках и уже ввёл подтверждающую фразу. Ссылка выкинула бы его на другую страницу и потеряла контекст; код оставляет на месте. Для входа решение обратное — там оставлена ссылка, потому что человек ещё никуда не пришёл.

**Interfaces:**
- Consumes: существующий `VerificationService` (`auth/verification_service.go`) — шестизначные коды, срок 10 минут, не более 5 попыток, коды хранятся хэшами, повторная отправка ограничена; таблица `email_verification_codes` (миграция 027). Подходит целиком: при удалении пользователь всегда есть, а `user_id` в таблице объявлен `NOT NULL`.
- Produces: признак наличия пароля в ответе о текущем пользователе; подтверждение удаления кодом.

- [ ] **Step 1: Написать падающий тест — форма не даёт удалиться без пароля**

```tsx
it('даёт удалиться аккаунту без пароля — подтверждением с почты', async () => {
    renderPrivacy({ hasPassword: false })

    await userEvent.type(screen.getByLabelText(/подтвержд/i), CONFIRM_PHRASE)

    // Поля пароля быть не должно: его неоткуда взять.
    expect(screen.queryByLabelText(/пароль/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /удалить/i })).toBeEnabled()
})

it('аккаунту с паролем по-прежнему нужен пароль', async () => {
    renderPrivacy({ hasPassword: true })

    await userEvent.type(screen.getByLabelText(/подтвержд/i), CONFIRM_PHRASE)

    expect(screen.getByLabelText(/пароль/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /удалить/i })).toBeDisabled()
})
```

- [ ] **Step 2: Написать падающий тест на подтверждение кодом**

```go
//go:build integration

// Необратимое действие для беспарольного аккаунта подтверждается кодом с
// почты, а не одной действующей сессией: для аккаунта с паролем угнанной
// сессии мало, и беспарольный не должен защищаться слабее.
func TestPasswordlessDeletionRequiresEmailedCode(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "deletion_code")
	svc := newAccountServiceForTest(t, db)

	userID := seedPasswordlessUser(t, db, "nopass@example.test")

	// Без кода — отказ, и аккаунт не помечен к удалению.
	err := svc.RequestDeletion(context.Background(), userID, "", "")
	require.Error(t, err)
	assertNotScheduledForDeletion(t, db, userID)

	code := requestDeletionCode(t, svc, userID)

	require.NoError(t, svc.RequestDeletion(context.Background(), userID, "", code))
	assertScheduledForDeletion(t, db, userID)
}

// Перебор шести цифр закрывается счётчиком попыток, как у подтверждения почты.
func TestPasswordlessDeletionCodeIsRateLimited(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "deletion_code_bruteforce")
	svc := newAccountServiceForTest(t, db)

	userID := seedPasswordlessUser(t, db, "brute@example.test")
	requestDeletionCode(t, svc, userID)

	var lastErr error
	for i := 0; i < 6; i++ {
		lastErr = svc.RequestDeletion(context.Background(), userID, "", "000000")
	}

	assert.True(t, errors.Is(lastErr, apperrors.ErrTooManyAttempts))
	assertNotScheduledForDeletion(t, db, userID)
}

// Аккаунт с паролем не меняет поведения: код ему не нужен и не спрашивается.
func TestDeletionWithPasswordIsUnchanged(t *testing.T) {
	db := testsupport.SchemaWithMigrations(t, "deletion_with_password")
	svc := newAccountServiceForTest(t, db)

	userID := seedUserWithPassword(t, db, "haspass@example.test", "верный пароль")

	require.NoError(t, svc.RequestDeletion(context.Background(), userID, "верный пароль", ""))
	assertScheduledForDeletion(t, db, userID)
}
```

- [ ] **Step 3: Запустить и убедиться, что падают**

Run:
```
export TEST_DATABASE_URL='postgres://burcev:burcev@localhost:5432/burcev_test?sslmode=disable'
cd apps/api && go test -tags=integration ./internal/modules/account/ -run 'TestPasswordlessDeletion|TestDeletionWithPassword' -v
```
Expected: первые два FAIL, третий PASS — он охраняет неизменность пути с паролем.

- [ ] **Step 4: Отдать признак наличия пароля клиенту**

`GetCurrentUser` (`auth/handler.go:453`) сейчас отвечает из токена и в базу не ходит. Добавь `has_password` — это один запрос по первичному ключу. В комментарии объясни, почему эндпоинт перестал быть чисто токенным: форма удаления обязана знать, что спрашивать, а вывести это из токена нельзя — пароль могли завести уже после его выдачи.

- [ ] **Step 5: Принимать код в `RequestDeletion`**

Для аккаунта с паролем — прежняя проверка, без изменений. Для беспарольного — проверка кода через существующий `VerificationService`. Отсутствие и того и другого — отказ, а не пропуск.

- [ ] **Step 6: Добавить отправку кода подтверждения удаления**

Отдельная тема письма: человек должен видеть в заголовке, что подтверждает удаление, а не вход. Тема и шаблон регистрируются в `email/dictionary.go`, как все остальные.

- [ ] **Step 7: Переделать форму**

Аккаунту с паролем — как сейчас. Беспарольному — кнопка «Прислать код», поле для шести цифр, и кнопка удаления,活ная при заполненной фразе и введённом коде. Поля пароля у него нет вовсе.

- [ ] **Step 8: Прогнать всё**

Run: `cd apps/api && go test -tags=integration ./... && go test ./...`
Run: `cd apps/web && npx jest src/features/settings/`
Expected: зелено; тест неизменности пути с паролем проходит.

- [ ] **Step 9: Commit**

```bash
git add apps/api/internal/modules/account/ apps/api/internal/modules/auth/ apps/api/internal/shared/email/ apps/web/src/features/settings/
git commit -m "feat(account): беспарольный пользователь удаляет аккаунт по коду с почты"
```

---

### Task 6: Маршруты, ограничение частоты и письмо

**Files:**
- Modify: `apps/api/internal/router/auth.go`
- Modify: `apps/api/internal/router/testdata/routes.golden` (перегенерация)
- Create: `apps/api/internal/shared/email/magic_link.go`
- Create: `apps/api/internal/shared/email/magic_link_test.go`
- Modify: `apps/api/internal/modules/auth/magiclink_test.go`

**Interfaces:**
- Consumes: `RequestMagicLink`, `ConsumeMagicLink` (задачи 2–3); `d.AuthRateLimiter.Limit(name)` — см. `internal/router/auth.go:17-18`.
- Produces: `func (s *Service) SendMagicLink(ctx context.Context, email, token string, existingAccount bool) error` в пакете `email`; маршруты `POST /api/v1/auth/magic-link/request` и `POST /api/v1/auth/magic-link/consume`.

- [ ] **Step 1: Написать падающий тест на шаблон письма**

```go
// Письмо различается по тексту, хотя ответ эндпоинта — нет: различие в ответе
// выдало бы наличие аккаунта, различие в письме видит только владелец ящика.
func TestMagicLinkEmailDistinguishesSignInFromSignUp(t *testing.T) {
	signIn, err := renderMagicLink("https://burcev.team/auth/link?token=abc", true)
	require.NoError(t, err)
	signUp, err := renderMagicLink("https://burcev.team/auth/link?token=abc", false)
	require.NoError(t, err)

	assert.Contains(t, signIn, "Вход")
	assert.Contains(t, signUp, "аккаунт")
	assert.NotEqual(t, signIn, signUp)

	// Транзакционное письмо: ссылки отписки в нём быть не должно — отписаться
	// от собственного входа нельзя.
	assert.NotContains(t, signIn, "Отписаться")
	assert.NotContains(t, signUp, "Отписаться")

	// Срок называется прямо: человек должен понимать, почему ссылка перестала
	// работать, не запрашивая новую наугад.
	assert.Contains(t, signIn, "15 минут")
}
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `cd apps/api && go test ./internal/shared/email/ -run TestMagicLinkEmail -v`
Expected: FAIL — `undefined: renderMagicLink`.

- [ ] **Step 3: Написать шаблон по образцу существующих писем**

Взять за образец соседний шаблон в `apps/api/internal/shared/email/`, повторив его структуру и стиль. Текст:
- заголовок для входа: «Вход в BURCEV»; для создания аккаунта: «Ваш аккаунт в BURCEV»;
- одна кнопка со ссылкой;
- строка «Ссылка действует 15 минут и сработает один раз.»;
- строка «Если вы не запрашивали вход, просто не открывайте ссылку.»;
- без блока отписки.

- [ ] **Step 4: Запустить тест шаблона**

Run: `cd apps/api && go test ./internal/shared/email/ -run TestMagicLinkEmail -v`
Expected: PASS.

- [ ] **Step 5: Написать падающий тест на ограничение частоты**

```go
func TestRequestMagicLinkIsRateLimited(t *testing.T) {
	r := routerWithRealLimiter(t)

	body := `{"email":"flood@example.com","consents":{"terms_of_service":true,"privacy_policy":true,"data_processing":true}}`
	var last *httptest.ResponseRecorder
	for i := 0; i < 20; i++ {
		last = post(r, "/api/v1/auth/magic-link/request", body)
	}

	assert.Equal(t, http.StatusTooManyRequests, last.Code)
}
```

- [ ] **Step 6: Зарегистрировать маршруты**

В `apps/api/internal/router/auth.go`, в группу `/auth`, рядом с существующими лимитируемыми эндпоинтами:

```go
	// Вход по одноразовой ссылке. Оба эндпоинта ограничены по частоте: первый
	// шлёт письма на чужой адрес, второй — угадываемая цель.
	g.POST("/magic-link/request", d.AuthRateLimiter.Limit("magic-link-request"), d.Auth.RequestMagicLink)
	g.POST("/magic-link/consume", d.AuthRateLimiter.Limit("magic-link-consume"), d.Auth.ConsumeMagicLink)
```

- [ ] **Step 7: Написать тест на отказ при выключенной почте**

```go
func TestRequestMagicLinkWhenEmailDisabled(t *testing.T) {
	r, svc, _ := setupAuthHandler(t)
	svc.mail = nil // способность выключена: config.Features без email

	w := post(r, "/auth/magic-link/request",
		`{"email":"a@example.com","consents":{"terms_of_service":true,"privacy_policy":true,"data_processing":true}}`)

	assert.Equal(t, http.StatusServiceUnavailable, w.Code)
	assert.Contains(t, w.Body.String(), "войдите по паролю")
}
```

- [ ] **Step 8: Перегенерировать golden и просмотреть дифф**

Run: `cd apps/api && UPDATE_GOLDEN=1 go test ./internal/router/`
Run: `git diff apps/api/internal/router/testdata/routes.golden`
Expected: ровно две новые строки — оба маршрута `magic-link`. Ничего другого не добавилось и не пропало.

- [ ] **Step 9: Прогнать маршрутные тесты**

Run: `cd apps/api && go test ./internal/router/`
Expected: PASS — матрица авторизации полна (у новых маршрутов нет идентификатора в пути, записи в реестре не требуются).

- [ ] **Step 10: Commit**

```bash
git add apps/api/internal/router/ apps/api/internal/shared/email/ apps/api/internal/modules/auth/
git commit -m "feat(auth): маршруты и письмо одноразовой ссылки входа"
```

---

### Task 7: Форма запроса ссылки на экране входа

**Files:**
- Create: `apps/web/src/features/auth/api/magicLink.ts`
- Modify: `apps/web/src/features/auth/components/AuthScreen.tsx`
- Create: `apps/web/src/features/auth/components/__tests__/MagicLinkForm.test.tsx`

**Interfaces:**
- Consumes: `POST /api/v1/auth/magic-link/request` (задача 6); `apiClient` из `@/shared/utils/api-client`; `leadToken()` из `@/features/onboarding/api/guest`.
- Produces:
  - `export const magicLinkApi = { request(email: string, consents: MagicLinkConsents): Promise<void>, consume(token: string, leadToken: string | null): Promise<{ created: boolean }> }`
  - `export interface MagicLinkConsents { terms_of_service: boolean; privacy_policy: boolean; data_processing: boolean; marketing: boolean }`

- [ ] **Step 1: Написать падающий тест на единый ответ и согласия**

```tsx
describe('MagicLinkForm', () => {
    it('показывает один и тот же текст независимо от того, есть ли аккаунт', async () => {
        render(<MagicLinkForm />)

        await userEvent.type(screen.getByLabelText(/почт/i), 'known@example.com')
        await userEvent.click(screen.getByLabelText(/условия/i))
        await userEvent.click(screen.getByLabelText(/обработку/i))
        await userEvent.click(screen.getByRole('button', { name: /ссылк/i }))

        expect(await screen.findByText(/мы отправили на него ссылку/i)).toBeInTheDocument()
    })

    it('не отправляет запрос без обязательных согласий', async () => {
        render(<MagicLinkForm />)

        await userEvent.type(screen.getByLabelText(/почт/i), 'someone@example.com')
        await userEvent.click(screen.getByRole('button', { name: /ссылк/i }))

        expect(screen.getByRole('button', { name: /ссылк/i })).toBeDisabled()
    })
})
```

- [ ] **Step 2: Написать падающий тест на доступность формы пароля**

```tsx
    it('оставляет вход по паролю доступным без перезагрузки страницы', async () => {
        render(<AuthScreen />)

        await userEvent.click(screen.getByRole('button', { name: /войти по паролю/i }))

        expect(screen.getByLabelText(/пароль/i)).toBeInTheDocument()
    })
```

- [ ] **Step 3: Запустить тесты и убедиться, что они падают**

Run: `cd apps/web && npx jest src/features/auth/components/__tests__/MagicLinkForm.test.tsx`
Expected: FAIL — компонент не существует.

- [ ] **Step 4: Реализовать клиент API**

```ts
/**
 * Вход по одноразовой ссылке.
 *
 * Ответ на запрос ссылки намеренно одинаков для существующего и
 * несуществующего адреса — на клиенте этим различием тоже пользоваться нельзя.
 */
import { apiClient } from '@/shared/utils/api-client'

export interface MagicLinkConsents {
    terms_of_service: boolean
    privacy_policy: boolean
    data_processing: boolean
    marketing: boolean
}

export const magicLinkApi = {
    async request(email: string, consents: MagicLinkConsents): Promise<void> {
        await apiClient.post('/api/v1/auth/magic-link/request', { email, consents })
    },

    async consume(token: string, leadToken: string | null): Promise<{ created: boolean }> {
        const { data } = await apiClient.post('/api/v1/auth/magic-link/consume', {
            token,
            lead_token: leadToken ?? undefined,
        })
        return { created: Boolean(data?.created) }
    },
}
```

- [ ] **Step 5: Реализовать форму**

Форма содержит: поле почты, три обязательных согласия (условия, политика конфиденциальности, обработка данных) и одно необязательное (маркетинг); кнопка неактивна, пока обязательные не отмечены. После успешной отправки форма заменяется текстом «Если такой адрес существует, мы отправили на него ссылку для входа» — тем же, что отдаёт сервер. Ниже — ссылка «Войти по паролю», раскрывающая существующую форму пароля.

Тексты согласий взять из задачи 1.2 предложения; они обязаны пройти `consentWording.test.ts`.

- [ ] **Step 6: Запустить тесты**

Run: `cd apps/web && npx jest src/features/auth/`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/auth/
git commit -m "feat(auth): форма входа по ссылке на экране входа"
```

---
### Task 8: Страница перехода по ссылке

**Files:**
- Create: `apps/web/src/app/auth/link/consume/page.tsx`
- Create: `apps/web/src/features/auth/components/MagicLinkConsume.tsx`
- Create: `apps/web/src/features/auth/components/__tests__/MagicLinkConsume.test.tsx`

**Interfaces:**
- Consumes: `magicLinkApi.consume` (задача 7); `leadToken()` из `@/features/onboarding/api/guest`.
- Produces: маршрут `/auth/link/consume?token=...`. Новых экспортов для других задач не даёт.

Каталог `apps/web/src/app/auth/link/` уже занят подтверждением привязки внешнего провайдера — новая страница кладётся вложенной, чтобы не задеть существующий маршрут.

- [ ] **Step 1: Написать падающие тесты на три исхода**

```tsx
describe('MagicLinkConsume', () => {
    it('входит и уводит в приложение', async () => {
        server.use(http.post('*/auth/magic-link/consume', () =>
            HttpResponse.json({ data: { created: false } })))

        render(<MagicLinkConsume token="good" />)

        await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/dashboard'))
    })

    it('уводит нового пользователя в онбординг, а не в дашборд', async () => {
        server.use(http.post('*/auth/magic-link/consume', () =>
            HttpResponse.json({ data: { created: true } })))

        render(<MagicLinkConsume token="fresh" />)

        await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/onboarding'))
    })

    it('объясняет отказ и предлагает запросить новую ссылку', async () => {
        server.use(http.post('*/auth/magic-link/consume', () =>
            HttpResponse.json({ message: 'Ссылка не подходит — запросите новую' }, { status: 400 })))

        render(<MagicLinkConsume token="stale" />)

        expect(await screen.findByText(/запросите новую/i)).toBeInTheDocument()
        expect(screen.getByRole('link', { name: /вход/i })).toHaveAttribute('href', '/auth')
    })
})
```

- [ ] **Step 2: Запустить и убедиться, что падают**

Run: `cd apps/web && npx jest src/features/auth/components/__tests__/MagicLinkConsume.test.tsx`
Expected: FAIL — компонента нет.

- [ ] **Step 3: Реализовать компонент**

```tsx
'use client'

/**
 * Переход по ссылке из письма.
 *
 * Истёкшая, использованная и поддельная ссылка приходят сюда одним и тем же
 * отказом — так задумано на сервере, и здесь их тоже не надо различать.
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { magicLinkApi } from '../api/magicLink'
import { leadToken } from '@/features/onboarding/api/guest'
import { EVENTS, track } from '@/shared/analytics'

export function MagicLinkConsume({ token }: { token: string }) {
    const router = useRouter()
    const [failed, setFailed] = useState(false)

    useEffect(() => {
        let cancelled = false
        magicLinkApi
            .consume(token, leadToken())
            .then(({ created }) => {
                if (cancelled) return
                track(EVENTS.magicLinkConsumed, { outcome: created ? 'created' : 'signed_in' })
                // Новому — в онбординг: у него ещё нет ни профиля, ни данных.
                router.push(created ? '/onboarding' : '/dashboard')
            })
            .catch(() => {
                if (!cancelled) setFailed(true)
            })
        return () => {
            cancelled = true
        }
    }, [token, router])

    if (!failed) return <p>Входим…</p>

    return (
        <div>
            <p>Ссылка не подходит — запросите новую.</p>
            <Link href="/auth">Вернуться ко входу</Link>
        </div>
    )
}
```

- [ ] **Step 4: Реализовать страницу**

```tsx
import { MagicLinkConsume } from '@/features/auth/components/MagicLinkConsume'

export const metadata = { title: 'Вход', robots: { index: false, follow: false } }

export default async function MagicLinkPage({
    searchParams,
}: {
    searchParams: Promise<{ token?: string }>
}) {
    const { token } = await searchParams
    if (!token) return <p>Ссылка не подходит — запросите новую.</p>
    return <MagicLinkConsume token={token} />
}
```

- [ ] **Step 5: Запустить тесты**

Run: `cd apps/web && npx jest src/features/auth/`
Expected: PASS все три.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/auth/link/consume/ apps/web/src/features/auth/components/MagicLinkConsume.tsx apps/web/src/features/auth/components/__tests__/MagicLinkConsume.test.tsx
git commit -m "feat(auth): страница перехода по ссылке входа"
```

---

### Task 9: Посадочная страница

**Files:**
- Modify: `apps/web/src/app/page.tsx` (переписывается целиком)
- Create: `apps/web/src/app/__tests__/page.test.tsx` (или дополнить существующий в этом каталоге)

**Interfaces:**
- Consumes: `INTERNAL_API_URL` (умолчание `http://api:4000`) — серверный путь к API, которым уже пользуются `src/app/sitemap.ts:4` и `src/app/content/[id]/page.tsx:5`.
- Produces: ничего для других задач.

**Откуда страница узнаёт о способностях** (вопрос, оставленный открытым в предложении, решён так):

Лендинг — серверный компонент, поэтому он спрашивает у API его собственное мнение о себе:

```ts
const API_URL = process.env.INTERNAL_API_URL || 'http://api:4000'

async function enabledFeatures(): Promise<Record<string, boolean>> {
    try {
        const res = await fetch(`${API_URL}/ready`, {
            next: { revalidate: 60 },
            signal: AbortSignal.timeout(2000),
        })
        if (!res.ok) return {}
        const data = await res.json()
        return data?.features || {}
    } catch {
        // Обещание, которое нельзя подтвердить, не даётся: при недоступном
        // API страница рендерится без утверждений о способностях, а не с
        // ними. Лендинг при этом открывается — он и без тезиса работает.
        return {}
    }
}
```

*Почему `/ready`, а не переменная сборки:* способность выводится из наличия учётных данных у API (`config.Features`), и второй источник правды разошёлся бы с первым молча. `/ready` отдаёт `features` (`internal/router/router.go:195`) — заметь, именно `/ready`, а не `/health`: в `CLAUDE.md` написано иначе, и это ошибка документации.

*Почему пустой объект при отказе:* все утверждения о способностях исчезают. Это честнее, чем показать обещание, которое некому подтвердить.

- [ ] **Step 1: Написать падающие тесты на структуру**

```tsx
describe('Посадочная страница', () => {
    it('предлагает вход и регистрацию как отдельные действия в шапке', () => {
        render(<Home />)
        const header = screen.getByRole('banner')

        expect(within(header).getByRole('link', { name: 'Войти' })).toHaveAttribute('href', '/auth')
        expect(within(header).getByRole('link', { name: 'Регистрация' }))
            .toHaveAttribute('href', '/auth?mode=register')
    })

    it('в блоке перед подвалом даёт вход и регистрацию и не даёт расчёт', () => {
        render(<Home />)
        const cta = screen.getByTestId('landing-cta')

        expect(within(cta).getByRole('link', { name: /войти/i })).toBeInTheDocument()
        expect(within(cta).getByRole('link', { name: /регистрац/i })).toBeInTheDocument()
        expect(within(cta).queryByRole('link', { name: /рассчитать/i })).not.toBeInTheDocument()
    })

    it('не показывает блок отзывов, пока подтверждённых данных нет', () => {
        render(<Home />)
        expect(screen.queryByTestId('landing-social-proof')).not.toBeInTheDocument()
    })
})
```

- [ ] **Step 2: Написать падающий тест на условное утверждение**

```tsx
    it('не обещает добавление еды по фото, когда способность выключена', () => {
        render(<Home features={{ food_recognition: false }} />)
        expect(screen.queryByText(/по фото/i)).not.toBeInTheDocument()
    })

    it('обещает добавление еды по фото, когда способность включена', () => {
        render(<Home features={{ food_recognition: true }} />)
        expect(screen.getByText(/по фото/i)).toBeInTheDocument()
    })
```

- [ ] **Step 3: Запустить и убедиться, что падают**

Run: `cd apps/web && npx jest src/app/__tests__/page.test.tsx`
Expected: FAIL — в шапке одна ссылка «Войти», блока `landing-cta` нет.

- [ ] **Step 4: Переписать страницу**

Структура сверху вниз:

1. **Шапка** (`<header>`): логотип, `Войти` → `/auth`, `Регистрация` → `/auth?mode=register`.
2. **Герой**: заголовок, подзаголовок, основное действие `Рассчитать мою норму` → `/onboarding`, под ним тихая ссылка `Уже есть аккаунт`.
3. **Четыре утверждения** вместо шести карточек возможностей. Тексты — из задачи 1.2 предложения; смысл каждого:
   - норма КБЖУ за минуту, без аккаунта и без ожидания набора;
   - еду можно сфотографировать, а не искать в базе (**только при включённой способности `food_recognition`**);
   - куратор видит дневник, а не пересказ;
   - начать можно сегодня.
4. **Блок про куратора** — апселл, без цены: что делает куратор (недельные планы КБЖУ, задачи, разбор отчётов), без обещания сроков и результата.
5. **Слот социального доказательства** — `data-testid="landing-social-proof"`, рендерится только при непустых данных. Пока данных нет — не рендерится вовсе.
6. **Блок призыва** — `data-testid="landing-cta"`: вход и регистрация рядом, без действия расчёта.
7. **Подвал** — как сейчас, включая `SupportLink`.

Сохранить без изменений: `JsonLd`, `AuthRedirect`, `TrackView event={EVENTS.landingViewed}`.

- [ ] **Step 5: Обновить метаданные**

`title` и `description` привести в соответствие новому сообщению; `webAppJsonLd.description` — тоже. Цену в `offers` не трогать: расчёт и дневник остаются бесплатными.

- [ ] **Step 6: Запустить тесты и проверки**

Run: `cd apps/web && npx jest src/app/__tests__/page.test.tsx`
Expected: PASS все пять.

Run: `cd apps/web && npm run lint && npm run type-check`
Expected: без ошибок.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/page.tsx apps/web/src/app/__tests__/page.test.tsx
git commit -m "feat(web): переписать посадочную страницу под четыре утверждения"
```

---

### Task 10: Захват контакта на экране результата

**Files:**
- Modify: `apps/web/src/features/onboarding/components/GuestOnboarding.tsx`
- Modify: `apps/web/src/features/onboarding/api/guest.ts`
- Modify: `apps/web/src/features/onboarding/components/__tests__/GuestOnboarding.test.tsx`
- Modify: `apps/api/internal/modules/leads/service.go` (сохранение источника)
- Create: `apps/api/migrations/074_leads_capture_source_up.sql`
- Create: `apps/api/migrations/074_leads_capture_source_down.sql`

**Interfaces:**
- Consumes: `guestApi.saveLead` и `rememberLeadToken` — существующие (`features/onboarding/api/guest.ts`); `leads.CreateInput` (`modules/leads/types.go`).
- Produces: столбец `leads.capture_source TEXT`; поле `CreateInput.CaptureSource string \`json:"capture_source"\``.

- [ ] **Step 1: Написать миграцию источника захвата**

```sql
-- Migration: Lead capture source
-- Version: 074
--
-- Контакт теперь берётся в трёх местах: шаг контакта в мастере, экран
-- результата и разговор с ботом. Без отметки источника сравнить их между собой
-- нельзя, а поле source уже занято — оно про то, откуда человек пришёл на сайт.

ALTER TABLE leads ADD COLUMN IF NOT EXISTS capture_source TEXT;
COMMENT ON COLUMN leads.capture_source IS 'Где оставлен контакт: contact_step | result | bot';
```

Откат: `ALTER TABLE leads DROP COLUMN IF EXISTS capture_source;`

- [ ] **Step 2: Написать падающий тест на источник**

```go
func TestCreateLeadStoresCaptureSource(t *testing.T) {
	svc, mock := setupService(t)

	mock.ExpectQuery(`INSERT INTO leads`).
		WithArgs(sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(),
			sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(),
			sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(),
			sqlmock.AnyArg(), "result", sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{"id", "created_at", "updated_at"}).
			AddRow("11111111-1111-1111-1111-111111111111", time.Now(), time.Now()))

	_, _, err := svc.Create(context.Background(), CreateInput{
		Email:         "r@example.com",
		CaptureSource: "result",
		Consents:      Consents{DataProcessing: true},
	}, "ip", "ua")

	require.NoError(t, err)
	require.NoError(t, mock.ExpectationsWereMet())
}
```

- [ ] **Step 3: Написать падающий тест фронта на вторую точку захвата**

```tsx
    it('сохраняет расчёт с экрана результата, не проходя шаг контакта', async () => {
        renderAtResultStep()

        await userEvent.type(screen.getByLabelText(/почт/i), 'result@example.com')
        await userEvent.click(screen.getByLabelText(/обработку/i))
        await userEvent.click(screen.getByRole('button', { name: /прислать расчёт/i }))

        await waitFor(() => expect(savedLead).toMatchObject({
            email: 'result@example.com',
            capture_source: 'result',
            last_step: 'result',
        }))
        // Человек остаётся там же и может продолжить мастер.
        expect(screen.getByText(/калори/i)).toBeInTheDocument()
    })

    it('не создаёт вторую заявку, когда гость доходит до шага контакта', async () => {
        renderAtResultStep()
        await saveFromResultScreen('result@example.com')

        await userEvent.click(screen.getByRole('button', { name: /дальше/i }))
        await userEvent.type(screen.getByLabelText(/почт/i), 'result@example.com')
        await userEvent.click(screen.getByRole('button', { name: /сохранить/i }))

        expect(createCalls).toHaveLength(1)
        expect(updateCalls).toHaveLength(1)
    })
```

- [ ] **Step 4: Запустить тесты и убедиться, что падают**

Run: `cd apps/api && go test ./internal/modules/leads/ -run TestCreateLeadStoresCaptureSource -v`
Run: `cd apps/web && npx jest src/features/onboarding/components/__tests__/GuestOnboarding.test.tsx`
Expected: оба FAIL.

- [ ] **Step 5: Реализовать бэкенд**

Добавить `CaptureSource` в `CreateInput` (`modules/leads/types.go`) и в `Lead`; провести его через `INSERT` в `Service.Create`. Значение по умолчанию, когда клиент его не прислал, — `contact_step`: это поведение существующего шага, и старые клиенты не должны писать пустое поле.

- [ ] **Step 6: Реализовать фронтенд**

На экране результата, под цифрами: поле почты, обязательное согласие на обработку, необязательное согласие на связь, кнопка «Прислать расчёт на почту». По успеху — `rememberLeadToken(token)`, форма заменяется подтверждением, мастер продолжается.

Шаг контакта далее читает `leadToken()`: если токен есть, вызывается обновление существующей заявки, а не создание новой.

- [ ] **Step 7: Запустить тесты**

Run: `cd apps/api && go test ./internal/modules/leads/`
Run: `cd apps/web && npx jest src/features/onboarding/`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/migrations/074_leads_capture_source_up.sql apps/api/migrations/074_leads_capture_source_down.sql apps/api/internal/modules/leads/ apps/web/src/features/onboarding/
git commit -m "feat(leads): захват контакта на экране результата расчёта"
```

---
### Task 11: Продуктовые события

**Files:**
- Modify: `apps/web/src/shared/analytics/events.ts:9-22`
- Modify: `apps/api/internal/modules/analytics/dictionary.go:10-47`
- Modify: `apps/api/internal/modules/analytics/dictionary_test.go`

**Interfaces:**
- Consumes: `track(event, properties)` из `@/shared/analytics`; события уже отправляются из `MagicLinkConsume` (задача 8).
- Produces: имена `magic_link_requested`, `magic_link_consumed`, `contact_captured` в обоих словарях.

- [ ] **Step 1: Написать падающий тест на совпадение словарей**

```go
// Словари обязаны совпадать: сервер отказывает в неизвестном имени, поэтому
// событие, объявленное только на клиенте, молча никогда не приходит — и в
// воронке на его месте дыра, неотличимая от «этого не делали».
func TestEventDictionariesMatch(t *testing.T) {
	fromServer := AllEventNames()

	source, err := os.ReadFile("../../../../web/src/shared/analytics/events.ts")
	require.NoError(t, err)

	re := regexp.MustCompile(`'([a-z_]+)'`)
	fromClient := map[string]bool{}
	for _, m := range re.FindAllStringSubmatch(string(source), -1) {
		fromClient[m[1]] = true
	}

	for _, name := range fromServer {
		assert.True(t, fromClient[name], "имя %q объявлено на сервере и отсутствует на клиенте", name)
	}
	for name := range fromClient {
		assert.Contains(t, fromServer, name, "имя %q объявлено на клиенте и отсутствует на сервере", name)
	}
}
```

Если такой тест в репозитории уже есть — дополнить его, а не дублировать.

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `cd apps/api && go test ./internal/modules/analytics/ -run TestEventDictionariesMatch -v`
Expected: FAIL после добавления имён только на одной стороне.

- [ ] **Step 3: Добавить имена в оба словаря**

```ts
    magicLinkRequested: 'magic_link_requested',
    magicLinkConsumed: 'magic_link_consumed',
    contactCaptured: 'contact_captured',
```

```go
	EventMagicLinkRequested = "magic_link_requested"
	EventMagicLinkConsumed  = "magic_link_consumed"
	EventContactCaptured    = "contact_captured"
```

- [ ] **Step 4: Отправлять события из трёх точек**

- `magic_link_requested` — из формы запроса ссылки (задача 7), после успешного ответа.
- `magic_link_consumed` — уже отправляется в `MagicLinkConsume` (задача 8) со свойством `outcome`: `created` или `signed_in`.
- `contact_captured` — из обеих точек захвата: экрана результата (`source: 'result'`) и шага контакта (`source: 'contact_step'`).

- [ ] **Step 5: Написать тесты отправки**

```tsx
    it('отправляет событие захвата контакта с источником', async () => {
        renderAtResultStep()
        await saveFromResultScreen('e@example.com')

        expect(trackSpy).toHaveBeenCalledWith('contact_captured', { source: 'result' })
    })
```

- [ ] **Step 6: Запустить всё**

Run: `cd apps/api && go test ./internal/modules/analytics/`
Run: `cd apps/web && npx jest src/shared/analytics src/features/auth src/features/onboarding`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/shared/analytics/events.ts apps/api/internal/modules/analytics/ apps/web/src/features/
git commit -m "feat(analytics): события входа по ссылке и захвата контакта"
```

---

### Task 12: Сквозная проверка и выкатка

**Files:**
- Create: `e2e/magic-link.spec.ts`
- Modify: `openspec/changes/landing-conversion/tasks.md` (отметки по факту)

**Interfaces:**
- Consumes: всё предыдущее.
- Produces: ничего.

- [ ] **Step 1: Написать E2E-сценарий входа по ссылке**

```ts
// Ходим через прокси на 3070, а не на 3069: rewrite в Next не пробрасывает
// Set-Cookie, и на прямом порту вход работает ровно до выдачи сессии.
test('гость входит по ссылке из письма и не вводит параметры заново', async ({ page }) => {
    await page.goto('http://localhost:3070/onboarding')
    await completeGuestWizard(page, { heightCm: 178, weightKg: 82.5 })

    await page.getByLabel(/почт/i).fill('e2e@example.com')
    await page.getByLabel(/обработку/i).check()
    await page.getByRole('button', { name: /прислать расчёт/i }).click()

    await page.goto('http://localhost:3070/auth')
    await page.getByLabel(/почт/i).fill('e2e@example.com')
    await page.getByLabel(/условия/i).check()
    await page.getByLabel(/конфиденциальност/i).check()
    await page.getByLabel(/обработку/i).check()
    await page.getByRole('button', { name: /ссылк/i }).click()

    const link = await readMagicLinkFromMailbox('e2e@example.com')
    await page.goto(link)

    await expect(page).toHaveURL(/\/onboarding/)
    await expect(page.getByDisplayValue('178')).toBeVisible()
    await expect(page.getByDisplayValue('82.5')).toBeVisible()
})
```

`readMagicLinkFromMailbox` — вспомогательная функция, читающая перехваченное письмо в тестовом окружении; реализовать по образцу существующего перехвата писем в `e2e/`, если он есть, иначе — через тестовый эндпоинт, доступный только при выключенном проде.

- [ ] **Step 2: Прогнать E2E явно на 3070**

Run: `E2E_BASE_URL=http://localhost:3070 npm run test:e2e -- magic-link`
Expected: PASS. Без явного `E2E_BASE_URL` прогон уезжает на dev — адрес задан в `e2e/.env`.

- [ ] **Step 3: Прогнать проверки целостности**

Run: `node scripts/check-api-contract.mjs`
Expected: без ошибок — оба новых пути есть в `routes.golden`.

Run: `node scripts/check-codebase-integrity.mjs`
Expected: без ошибок.

- [ ] **Step 4: Прогнать полный набор тестов**

Run: `cd apps/api && go test ./...`
Run: `cd apps/web && npx jest --coverage`
Run: `npm run test:e2e`
Expected: PASS; покрытие не ниже порогов (branches 79, functions 85, lines 87, statements 84).

- [ ] **Step 5: Выкатить на dev и проверить живьём**

dev деплоится сам на каждый push в `dev`. После выкатки проверить вручную:
1. запрос ссылки на новый адрес → письмо дошло → переход → аккаунт создан → попали в онбординг;
2. запрос ссылки на существующий адрес → переход → попали в дашборд;
3. попытка входа по паролю в беспарольный аккаунт → тот же отказ, что при неверном пароле;
4. повторный переход по той же ссылке → отказ с предложением запросить новую;
5. сохранение расчёта с экрана результата → заявка появилась.

Наблюдения приложить к PR.

- [ ] **Step 6: Выкатить на прод**

Прод выкатывается вручную через Dokploy API. Проверить те же пять пунктов. Если менялись переменные окружения — помнить, что `deploy` при том же коммите пропускается, а `redeploy` не пересоздаёт контейнер: нужна полная выкатка.

- [ ] **Step 7: Отметить задачи в предложении**

Проставить `[x]` в `openspec/changes/landing-conversion/tasks.md` **по факту проверенного**, а не по факту написанного кода.

- [ ] **Step 8: Commit**

```bash
git add e2e/magic-link.spec.ts openspec/changes/landing-conversion/tasks.md
git commit -m "test(e2e): вход по ссылке с переносом заявки"
```

---

## Self-Review

**Покрытие спеки.** Каждое требование покрыто:

| Требование | Задача |
|---|---|
| Разделение входа и регистрации | 9 |
| Утверждения опираются на доступные способности | 9 |
| Отсутствие непроверяемого социального доказательства | 9 |
| Переход в расчёт остаётся основным действием | 9 |
| Запрос ссылки входа по адресу почты | 2, 6 |
| Погашение ссылки входа | 3 |
| Создание аккаунта по ссылке входа | 3, 4 |
| Согласия при создании аккаунта по ссылке | 4 |
| Аккаунт без пароля | 1, 5 |
| Сохранение заявки с экрана результата | 10 |
| Учёт источника захвата контакта | 10 |
| События входа без пароля | 11 |
| Событие захвата контакта с источником | 11 |
| Словари событий совпадают | 11 |

**Известные допущения, которые исполнитель обязан проверить перед началом:**

1. Точные имена столбцов `users` (`email_verified`, `password_hash`) и таблицы профиля (`user_profiles`) взяты по смыслу — сверить с миграциями перед написанием тестов.
2. Существует ли уже тест совпадения словарей событий (задача 11, шаг 1) — если да, дополнить его.
3. Как устроен перехват писем в E2E (задача 12, шаг 1) — если механизма нет, он и есть первая часть этой задачи.
4. Сигнатуры `s.createUser`, `s.issueSession`, `h.setSessionCookies` названы по смыслу; сверить с `auth/service.go` и `auth/handler.go` и использовать существующие.
