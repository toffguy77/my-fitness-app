# Curator Lead Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Передать заявки и разговоры поддержки от супер-администратора кураторам и превратить список заявок в рабочую очередь, по которой можно разговаривать с людьми.

**Architecture:** Меняются роли и пути, не механизм защиты. У заявки нет клиента, поэтому `RequireClientRelationship` к ней неприменима — защита остаётся `protRole`, и расширяется только список ролей. Миграций базы данных нет. Очередь общая: любой куратор берёт любую заявку, отметка фиксирует, кто взял.

**Tech Stack:** Go 1.26 + Gin + database/sql, PostgreSQL, Next.js 16 App Router, React 19, Jest + RTL + MSW, Playwright.

**Spec:** `openspec/changes/curator-lead-workspace/` — `proposal.md`, `design.md`, `specs/{curator-lead-queue,resource-authorization,support-escalation}/spec.md`

## Global Constraints

- Язык интерфейса и всех пользовательских текстов — **русский**.
- Коммиты — conventional commits.
- **Роль куратора в коде называется `coordinator`**, не `curator`. Путь при этом `/curator/...` — это разные вещи, не перепутать.
- Маршрут с идентификатором в пути обязан быть в `protectedRoutes` (`apps/api/internal/router/authorization_matrix_test.go`) с осознанным выбором защиты, иначе сборка падает.
- Изменение маршрутов требует `UPDATE_GOLDEN=1 go test ./internal/router/` и просмотра диффа `internal/router/testdata/routes.golden`.
- `scripts/check-api-contract.mjs`: каждый путь, который зовёт фронтенд, обязан быть в `routes.golden`. Он и поймает страницу, оставшуюся на старом пути.
- Row Level Security выключена миграцией 015. Изоляции на уровне базы нет — всё держится на маршрутах и на том, что каждый запрос ограничен по владельцу.
- Локально и в E2E ходить через `scripts/dev-proxy.mjs` на **3070**.
- Пороги покрытия: branches 79 %, functions 85 %, lines 87 %, statements 84 %.
- **Зависимость от соседних планов.** Шаг остановки `bot` и поле `conversation_id` в записи очереди появляются вместе с планом `public-support-widget`. Если он ещё не выкачен, эти ветки не убирать — они обязаны корректно вести себя при отсутствии данных (переход к переписке просто не предлагается).
- **Это изменение прав доступа.** Каждая задача, трогающая роли, обязана нести тест на отказ для непривилегированного пользователя — не только тест на доступ для привилегированного.

---

### Task 1: Заявки переезжают к кураторам

**Files:**
- Modify: `apps/api/internal/router/leads.go` (`registerAdminLeadRoutes`)
- Modify: `apps/api/internal/router/authorization_matrix_test.go:128`
- Modify: `apps/api/internal/router/testdata/routes.golden` (перегенерация)
- Create: `apps/api/internal/router/curator_leads_test.go`

**Interfaces:**
- Consumes: `d.Leads.List`, `d.Leads.MarkHandled` — существующие обработчики.
- Produces: маршруты `GET /api/v1/curator/leads` и `POST /api/v1/curator/leads/:id/handled`; прежние `/admin/leads` перестают существовать.

- [ ] **Step 1: Написать падающие тесты на доступ и отказ**

```go
// Расширение прав проверяется с обеих сторон: и что куратор теперь проходит,
// и что все остальные по-прежнему нет. Тест только на первое превращает
// расширение роли в открытую дверь при первой же ошибке в middleware.
func TestCuratorLeadRoutesAllowCoordinatorAndAdmin(t *testing.T) {
	r := routerForTest(t)

	for _, role := range []string{"coordinator", "super_admin"} {
		w := getAs(r, "/api/v1/curator/leads", role)
		assert.NotEqual(t, http.StatusForbidden, w.Code, "роль %q обязана проходить", role)
		assert.NotEqual(t, http.StatusNotFound, w.Code)
	}
}

func TestCuratorLeadRoutesDenyEveryoneElse(t *testing.T) {
	r := routerForTest(t)

	for _, role := range []string{"user", "client", ""} {
		w := getAs(r, "/api/v1/curator/leads", role)
		assert.Equal(t, http.StatusForbidden, w.Code, "роль %q не должна проходить", role)
	}
}

func TestLeadRoutesRequireAuthentication(t *testing.T) {
	r := routerForTest(t)

	w := get(r, "/api/v1/curator/leads")

	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

// Пара путей к одним данным с разными проверками роли — именно та
// конструкция, в которой потом теряется проверка. Старый путь удаляется,
// а не остаётся синонимом.
func TestOldAdminLeadPathIsGone(t *testing.T) {
	r := routerForTest(t)

	w := getAs(r, "/api/v1/admin/leads", "super_admin")

	assert.Equal(t, http.StatusNotFound, w.Code)
}
```

- [ ] **Step 2: Запустить и убедиться, что падают**

Run: `cd apps/api && go test ./internal/router/ -run TestCuratorLead -v`
Expected: FAIL — путь `/curator/leads` не существует.

- [ ] **Step 3: Перенести группу**

В `apps/api/internal/router/leads.go` заменить `registerAdminLeadRoutes` на:

```go
// registerCuratorLeadRoutes wires the lead queue.
//
// Deliberately NOT inside /curator/clients/:id: that group is guarded by
// RequireClientRelationship, and a lead has no client by definition — it
// exists precisely until the person becomes one. The protection here is the
// role, as it was under /admin, and only the list of roles widens.
func registerCuratorLeadRoutes(v1 *gin.RouterGroup, d Deps) {
	g := v1.Group("/curator/leads")
	g.Use(middleware.RequireAuth(d.Cfg, d.TokenVersions))
	g.Use(middleware.RequireRole("coordinator", "super_admin"))

	g.GET("", d.Leads.List)
	g.POST("/:id/handled", d.Leads.MarkHandled)
}
```

Обновить вызов в месте регистрации маршрутов (там, где сейчас зовётся `registerAdminLeadRoutes`).

- [ ] **Step 4: Обновить реестр защищаемых маршрутов**

В `authorization_matrix_test.go` заменить ключ, сохранив механизм и переписав комментарий:

```go
	// Заявки. :id — заявка, у которой нет владельца-клиента: она существует
	// ровно до того, как человек им станет. Поэтому защита здесь — роль, а не
	// отношение, и роль намеренно видит чужие записи: смысл заявки в том,
	// чтобы с человеком поговорили, а разговаривают кураторы.
	"POST /api/v1/curator/leads/:id/handled": protRole,
```

- [ ] **Step 5: Перегенерировать golden и просмотреть дифф**

Run: `cd apps/api && UPDATE_GOLDEN=1 go test ./internal/router/`
Run: `git diff apps/api/internal/router/testdata/routes.golden`
Expected: два пути `/admin/leads...` исчезли, два `/curator/leads...` появились. Больше ничего.

- [ ] **Step 6: Запустить тесты**

Run: `cd apps/api && go test ./internal/router/`
Expected: PASS, включая `TestAuthorizationMatrixIsComplete`.

- [ ] **Step 7: Commit**

```bash
git add apps/api/internal/router/
git commit -m "feat(leads): заявки переходят к кураторам"
```

---

### Task 2: Разговоры поддержки переезжают к кураторам

**Files:**
- Modify: `apps/api/internal/router/support.go:17-19`
- Modify: `apps/api/internal/router/authorization_matrix_test.go:133-135`
- Modify: `apps/api/internal/router/testdata/routes.golden` (перегенерация)
- Modify: `apps/api/internal/router/curator_leads_test.go`

**Interfaces:**
- Consumes: `d.Support.List`, `Messages`, `Reply`, `CloseConversation`.
- Produces: маршруты `/api/v1/curator/support/conversations...`; прежние `/admin/support/...` перестают существовать.

- [ ] **Step 1: Написать падающие тесты**

```go
func TestCuratorSupportRoutesAllowCoordinator(t *testing.T) {
	r := routerForTest(t)

	w := getAs(r, "/api/v1/curator/support/conversations", "coordinator")

	assert.NotEqual(t, http.StatusForbidden, w.Code)
	assert.NotEqual(t, http.StatusNotFound, w.Code)
}

func TestCuratorSupportRoutesDenyOrdinaryUser(t *testing.T) {
	r := routerForTest(t)

	w := getAs(r, "/api/v1/curator/support/conversations", "user")

	assert.Equal(t, http.StatusForbidden, w.Code)
}

func TestOldAdminSupportPathIsGone(t *testing.T) {
	r := routerForTest(t)

	w := getAs(r, "/api/v1/admin/support/conversations", "super_admin")

	assert.Equal(t, http.StatusNotFound, w.Code)
}
```

- [ ] **Step 2: Запустить и убедиться, что падают**

Run: `cd apps/api && go test ./internal/router/ -run TestCuratorSupport -v`
Expected: FAIL.

- [ ] **Step 3: Перенести группу**

В `apps/api/internal/router/support.go`:

```go
	// Очередь разговоров. Разбирает её куратор: бот снимает простые вопросы,
	// а всё остальное — разговор с человеком, и это работа куратора, а не
	// администратора. Телеграмный вебхук остаётся публичным, как был.
	g := v1.Group("/curator/support")
	g.Use(middleware.RequireAuth(d.Cfg, d.TokenVersions))
	g.Use(middleware.RequireRole("coordinator", "super_admin"))
```

Комментарий к функции обновить: он сейчас говорит «operator's queue» — уточнить, кто этот оператор.

- [ ] **Step 4: Обновить три ключа в реестре**

```go
	// Разговоры поддержки. :id — разговор; собеседник приходит в него из
	// Telegram или из виджета, но никогда через эти маршруты. Защита — роль.
	"GET /api/v1/curator/support/conversations/:id":        protRole,
	"POST /api/v1/curator/support/conversations/:id/reply": protRole,
	"POST /api/v1/curator/support/conversations/:id/close": protRole,
```

- [ ] **Step 5: Перегенерировать golden и просмотреть дифф**

Run: `cd apps/api && UPDATE_GOLDEN=1 go test ./internal/router/ && git diff apps/api/internal/router/testdata/routes.golden`
Expected: четыре пути `/admin/support...` исчезли, четыре `/curator/support...` появились.

- [ ] **Step 6: Запустить тесты**

Run: `cd apps/api && go test ./internal/router/ ./internal/modules/support/`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/internal/router/
git commit -m "feat(support): очередь разговоров переходит к кураторам"
```

---

### Task 3: Очередь вместо списка

**Files:**
- Modify: `apps/api/internal/modules/leads/service.go:220` (`List`)
- Modify: `apps/api/internal/modules/leads/types.go`
- Modify: `apps/api/internal/modules/leads/handler.go` (`List`)
- Create: `apps/api/internal/modules/leads/queue_integration_test.go`

**Interfaces:**
- Consumes: таблица `leads`; `support_conversations.lead_id` (миграция 052).
- Produces:
  - `func (s *Service) Queue(ctx context.Context, includeHandled bool, limit, offset int) ([]QueueEntry, int, error)`
  - `type QueueEntry struct { Lead; AgeDays int; ReminderSent bool; ContactAllowed bool; ConversationID *string }`

- [ ] **Step 1: Написать падающий интеграционный тест на порядок и отбор**

```go
//go:build integration

// Очередь, а не таблица: сверху то, что ждёт дольше всех, и только то, чем
// ещё никто не занялся. Проверяется на живой базе — вопрос «что и в каком
// порядке вернул запрос» на подмене задаётся самому себе.
func TestQueueShowsUnhandledOldestFirst(t *testing.T) {
	db := testsupport.DB(t)
	svc := newServiceForTest(t, db)

	old := seedLead(t, db, "old@example.com", daysAgo(10))
	recent := seedLead(t, db, "recent@example.com", daysAgo(1))
	done := seedLead(t, db, "done@example.com", daysAgo(5))
	markHandled(t, db, done)

	entries, total, err := svc.Queue(context.Background(), false, 20, 0)
	require.NoError(t, err)

	require.Len(t, entries, 2)
	assert.Equal(t, 2, total)
	assert.Equal(t, old, entries[0].ID, "дольше всех ждёт — первым")
	assert.Equal(t, recent, entries[1].ID)

	withHandled, _, err := svc.Queue(context.Background(), true, 20, 0)
	require.NoError(t, err)
	assert.Len(t, withHandled, 3)
}
```

- [ ] **Step 2: Написать падающий тест на состав записи**

```go
//go:build integration

// Список почт — это не инструмент, а повод для рассылки. Куратор должен
// открыть заявку и понимать, что сказать этому человеку.
func TestQueueEntryCarriesGroundsForConversation(t *testing.T) {
	db := testsupport.DB(t)
	svc := newServiceForTest(t, db)

	id := seedLeadAt(t, db, "stuck@example.com", "result", daysAgo(3), true)
	markReminded(t, db, id)
	conversationID := seedWebConversationForLead(t, db, id)

	entries, _, err := svc.Queue(context.Background(), false, 20, 0)
	require.NoError(t, err)
	require.Len(t, entries, 1)

	e := entries[0]
	assert.Equal(t, "result", e.LastStep)
	assert.Equal(t, 3, e.AgeDays)
	assert.True(t, e.ReminderSent)
	assert.True(t, e.ContactAllowed)
	require.NotNil(t, e.ConversationID)
	assert.Equal(t, conversationID, *e.ConversationID)
}

func TestQueueEntryWithoutConsentIsMarked(t *testing.T) {
	db := testsupport.DB(t)
	svc := newServiceForTest(t, db)

	seedLeadAt(t, db, "nocontact@example.com", "contact", daysAgo(2), false)

	entries, _, err := svc.Queue(context.Background(), false, 20, 0)
	require.NoError(t, err)
	require.Len(t, entries, 1)

	// Заявка видна — она говорит о потоке. Но писать ей нельзя, и это должно
	// быть свойством данных, а не памятью куратора.
	assert.False(t, entries[0].ContactAllowed)
}
```

- [ ] **Step 3: Запустить и убедиться, что падают**

Run: `cd apps/api && go test -tags=integration ./internal/modules/leads/ -run TestQueue -v`
Expected: FAIL — `undefined: Queue`.

- [ ] **Step 4: Реализовать**

```go
// QueueEntry — заявка вместе с основанием для разговора.
type QueueEntry struct {
	Lead
	// Сколько дней человек ждёт. Считается на сервере: у куратора и у базы
	// разные часовые пояса, и «три дня» не должно зависеть от браузера.
	AgeDays int `json:"age_days"`
	// Ушло ли автоматическое напоминание. Оно ровно одно, и знать, было ли
	// оно, нужно до того, как писать самому.
	ReminderSent bool `json:"reminder_sent"`
	// Можно ли писать вообще. Согласия разделены намеренно (миграция 051), и
	// человеческий догон не может быть лазейкой в обход того, на что человек
	// не согласился.
	ContactAllowed bool `json:"contact_allowed"`
	// Разговор с ботом, если он был: тогда видно, о чём человек спрашивал.
	ConversationID *string `json:"conversation_id,omitempty"`
}

// Queue отдаёт заявки в том порядке, в котором их стоит разбирать.
func (s *Service) Queue(ctx context.Context, includeHandled bool, limit, offset int) ([]QueueEntry, int, error) {
	// ... SELECT ... FROM leads l
	//     LEFT JOIN support_conversations c ON c.lead_id = l.id
	//     WHERE ($1 OR l.handled_at IS NULL)
	//     ORDER BY l.created_at ASC
	//     LIMIT $2 OFFSET $3
}
```

Поле `AgeDays` считать в SQL (`EXTRACT(DAY FROM NOW() - l.created_at)`), а не в Go: так оно берётся из того же источника времени, что и сама заявка.

- [ ] **Step 5: Провести через обработчик**

`Handler.List` вызывает `Queue`, читает `includeHandled` из строки запроса и возвращает через `response.Paginated` (`internal/shared/response/pagination.go:57`), как это делают соседние коллекции.

- [ ] **Step 6: Запустить тесты**

Run: `cd apps/api && go test ./internal/modules/leads/ && go test -tags=integration ./internal/modules/leads/`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/internal/modules/leads/
git commit -m "feat(leads): очередь с основанием для разговора"
```

---

### Task 4: Повторная отметка не перезаписывает первую

**Files:**
- Modify: `apps/api/internal/modules/leads/service.go:250` (`MarkHandled`)
- Modify: `apps/api/internal/modules/leads/queue_integration_test.go`

**Interfaces:**
- Consumes: `MarkHandled(ctx, leadID, byUserID)` — существующая сигнатура, не меняется.
- Produces: `apperrors.ErrConflict` при повторной отметке.

- [ ] **Step 1: Написать падающий интеграционный тест**

```go
//go:build integration

// Очередь общая, и двое могут взять одну заявку. Цена — один лишний
// разговор, а не потерянный человек; но запись о том, кто взял первым,
// перезаписывать нельзя, иначе непонятно, кто с человеком говорил.
func TestMarkHandledKeepsFirstClaim(t *testing.T) {
	db := testsupport.DB(t)
	svc := newServiceForTest(t, db)

	id := seedLead(t, db, "contested@example.com", daysAgo(1))

	require.NoError(t, svc.MarkHandled(context.Background(), id, 11))
	err := svc.MarkHandled(context.Background(), id, 22)
	assert.Error(t, err, "вторая отметка обязана сообщить, что заявку уже взяли")

	var by int64
	require.NoError(t, db.QueryRow(
		`SELECT handled_by FROM leads WHERE id = $1`, id).Scan(&by))
	assert.Equal(t, int64(11), by, "первая отметка не перезаписывается")
}
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `cd apps/api && go test -tags=integration ./internal/modules/leads/ -run TestMarkHandledKeepsFirstClaim -v`
Expected: FAIL — текущий `UPDATE` перезаписывает безусловно.

- [ ] **Step 3: Реализовать условием в запросе**

```go
	// Условие в запросе, а не проверка перед ним: двое кураторов нажимают
	// одновременно, и разойтись они должны на уровне базы.
	res, err := s.db.ExecContext(ctx, `
		UPDATE leads
		   SET handled_at = NOW(), handled_by = $2, updated_at = NOW()
		 WHERE id = $1 AND handled_at IS NULL`, leadID, byUserID)
	if err != nil {
		return fmt.Errorf("mark lead handled: %w", err)
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("mark lead handled: %w", err)
	}
	if affected == 0 {
		return apperrors.ErrConflict
	}
	return nil
```

В обработчике отдать `409` с текстом «Эту заявку уже взял другой куратор».

- [ ] **Step 4: Запустить тесты**

Run: `cd apps/api && go test ./internal/modules/leads/ && go test -tags=integration ./internal/modules/leads/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/internal/modules/leads/
git commit -m "fix(leads): повторная отметка не перезаписывает первую"
```

---
### Task 5: Страницы переезжают в кураторское рабочее место

**Files:**
- Move: `apps/web/src/app/admin/leads/` → `apps/web/src/app/curator/leads/`
- Move: `apps/web/src/app/admin/support/` → `apps/web/src/app/curator/support/`
- Modify: клиенты API этих разделов (пути `/api/v1/admin/...` → `/api/v1/curator/...`)
- Modify: навигация кураторского рабочего места

**Interfaces:**
- Consumes: маршруты из задач 1–3.
- Produces: страницы `/curator/leads` и `/curator/support`.

- [ ] **Step 1: Перенести каталоги**

```bash
git mv apps/web/src/app/admin/leads apps/web/src/app/curator/leads
git mv apps/web/src/app/admin/support apps/web/src/app/curator/support
```

- [ ] **Step 2: Найти все обращения к старым путям**

Run: `rg -n "admin/leads|admin/support" apps/web/src`
Expected: список мест, требующих правки. Каждое — либо путь API, либо ссылка навигации.

- [ ] **Step 3: Проверить контракт до правки — он обязан упасть**

Run: `node scripts/check-api-contract.mjs`
Expected: FAIL — фронтенд зовёт `/api/v1/admin/leads`, которого больше нет в `routes.golden`. Это и есть проверка, ради которой скрипт существует; убедиться, что она срабатывает, прежде чем чинить.

- [ ] **Step 4: Заменить пути и ссылки**

Заменить `/api/v1/admin/leads` → `/api/v1/curator/leads`, `/api/v1/admin/support` → `/api/v1/curator/support`; ссылки навигации `/admin/leads` → `/curator/leads`, `/admin/support` → `/curator/support`.

- [ ] **Step 5: Добавить разделы в навигацию куратора**

Два пункта: «Заявки» и «Поддержка». Убрать их из административной навигации — путь удалён, пункт вёл бы в никуда.

- [ ] **Step 6: Проверить контракт снова**

Run: `node scripts/check-api-contract.mjs`
Expected: без ошибок.

Run: `cd apps/web && npm run lint && npm run type-check`
Expected: без ошибок.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/
git commit -m "refactor(web): разделы заявок и поддержки в кураторском рабочем месте"
```

---

### Task 6: Список заявок становится очередью

**Files:**
- Modify: `apps/web/src/app/curator/leads/page.tsx` и компоненты раздела
- Create/Modify: тесты раздела в `apps/web/src/app/curator/leads/__tests__/`

**Interfaces:**
- Consumes: `GET /api/v1/curator/leads` с полями `age_days`, `reminder_sent`, `contact_allowed`, `conversation_id` (задача 3).
- Produces: ничего для других задач.

- [ ] **Step 1: Написать падающие тесты**

```tsx
describe('Очередь заявок', () => {
    it('показывает основание для разговора, а не только контакт', async () => {
        renderQueue([
            { id: '1', email: 'a@example.com', last_step: 'result', age_days: 3,
              reminder_sent: true, contact_allowed: true },
        ])

        expect(await screen.findByText(/результат/i)).toBeInTheDocument()
        expect(screen.getByText(/3 дня/i)).toBeInTheDocument()
        expect(screen.getByText(/напоминание отправлено/i)).toBeInTheDocument()
    })

    it('помечает запретом заявку без согласия на связь и не предлагает написать', async () => {
        renderQueue([
            { id: '2', email: 'b@example.com', last_step: 'contact', age_days: 1,
              reminder_sent: false, contact_allowed: false },
        ])

        expect(await screen.findByText(/писать нельзя/i)).toBeInTheDocument()
        expect(screen.queryByRole('link', { name: /написать/i })).not.toBeInTheDocument()
        // Контакт при этом не скрыт: он объясняет, о ком речь.
        expect(screen.getByText('b@example.com')).toBeInTheDocument()
    })

    it('даёт перейти к разговору, если он был', async () => {
        renderQueue([
            { id: '3', email: 'c@example.com', last_step: 'bot', age_days: 0,
              reminder_sent: false, contact_allowed: true, conversation_id: 'conv-1' },
        ])

        expect(await screen.findByRole('link', { name: /переписк/i }))
            .toHaveAttribute('href', '/curator/support/conv-1')
    })

    it('не предлагает переход к разговору, когда его нет', async () => {
        renderQueue([
            { id: '4', email: 'd@example.com', last_step: 'contact', age_days: 2,
              reminder_sent: false, contact_allowed: true },
        ])

        await screen.findByText('d@example.com')
        expect(screen.queryByRole('link', { name: /переписк/i })).not.toBeInTheDocument()
    })

    it('сообщает, что заявку уже взяли', async () => {
        server.use(http.post('*/curator/leads/:id/handled', () =>
            HttpResponse.json({ message: 'Эту заявку уже взял другой куратор' }, { status: 409 })))

        renderQueue([{ id: '5', email: 'e@example.com', last_step: 'contact', age_days: 1,
                       reminder_sent: false, contact_allowed: true }])
        await userEvent.click(await screen.findByRole('button', { name: /обработана/i }))

        expect(await screen.findByText(/уже взял/i)).toBeInTheDocument()
    })
})
```

- [ ] **Step 2: Запустить и убедиться, что падают**

Run: `cd apps/web && npx jest src/app/curator/leads`
Expected: FAIL — раздел пока отображает таблицу контактов.

- [ ] **Step 3: Переделать раздел**

Каждая запись показывает: шаг остановки словами (не кодом — `result` → «увидел расчёт», `contact` → «на шаге контакта», `bot` → «писал боту»), сколько ждёт, было ли напоминание, можно ли писать, ссылку на переписку при наличии, кнопку «Обработана».

Заявка без согласия на связь помечена явно; действие «Написать» у неё отсутствует, а не просто неактивно — неактивная кнопка выглядит как временное препятствие.

По умолчанию показываются необработанные; переключатель открывает остальные.

- [ ] **Step 4: Запустить тесты**

Run: `cd apps/web && npx jest src/app/curator/`
Expected: PASS все пять.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/curator/leads/
git commit -m "feat(web): очередь заявок вместо таблицы контактов"
```

---

### Task 7: Руководство куратора

**Files:**
- Modify: `docs/curator-guide/10-воронка-и-возвращение-клиентов.md` (переписывается)
- Modify: `docs/curator-guide/11-бот-поддержки.md`
- Create: `apps/api/internal/modules/support/curator_guide_test.go` (или дополнить существующую проверку документации, если она есть)

**Interfaces:**
- Consumes: поведение, реализованное задачами 1–6.
- Produces: ничего для кода.

- [ ] **Step 1: Написать падающий тест на отсутствие устаревшего утверждения**

```go
// Раздел про воронку прямым текстом сообщал, что экрана заявок у куратора нет
// и это граница ролей. После переноса это ложь, а устаревшее описание границ
// доступа хуже отсутствующего.
func TestCuratorGuideDoesNotDenyLeadAccess(t *testing.T) {
	text, err := os.ReadFile("../../../../docs/curator-guide/10-воронка-и-возвращение-клиентов.md")
	require.NoError(t, err)

	for _, stale := range []string{
		"только администратору",
		"такого экрана нет",
		"это к администратору",
	} {
		assert.NotContains(t, string(text), stale,
			"устаревшее утверждение о доступе к заявкам: %q", stale)
	}

	assert.Contains(t, string(text), "/curator/leads")
}
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `cd apps/api && go test ./internal/modules/support/ -run TestCuratorGuide -v`
Expected: FAIL — файл содержит «такого экрана нет» (строка 39).

- [ ] **Step 3: Переписать раздел 10**

Сохранить таблицу трёх состояний, но исправить третий столбец: заявками теперь занимается куратор, а не только система. Дальше:

- **Что делает автоматика без тебя** — оставить как есть: одно письмо через сутки, проверка раз в час, только при согласии на связь, ссылка действует 14 дней, заявка удаляется через 90. Явно сказать, что напоминание ровно одно и второго не будет.
- **Что делаешь ты** — новый раздел. Очередь открыта на `/curator/leads`, сверху ждущие дольше всех. Очередь общая: заявку берёт тот, кто до неё дошёл; «Обработана» фиксирует, кто взял, и повторно взять её нельзя.
- **Когда писать нельзя** — отдельным блоком, не примечанием. Нет согласия на связь — не пишем, ни письмом, ни как-либо ещё. Заявка видна, потому что она говорит о потоке, а не потому, что её можно трогать.
- **Что говорить в зависимости от шага остановки:**
  - «увидел расчёт» — человек получил цифры и ушёл; спрашивать, что было непонятно в расчёте, а не предлагать регистрацию;
  - «на шаге контакта» — дошёл до конца мастера, но не завершил; ближе всех к аккаунту;
  - «писал боту» — у него был вопрос, и он есть в переписке; открыть её до того, как писать.
- **Когда заявка считается обработанной** — после того, как ты с человеком поговорил или убедился, что говорить не с кем. Не после того, как прочитал.
- **Чего мы не делаем** — цепочек догоняющих писем. Одно напоминание от системы, дальше разговор или ничего.

- [ ] **Step 4: Дополнить раздел 11**

Добавить: очередь разговоров теперь у тебя, на `/curator/support`; каналов два — Telegram и виджет на сайте; в веб-разговор ответ человек увидит, когда вернётся на страницу, и написать ему туда первыми нельзя — для этого нужен либо его Telegram, либо согласие на связь в заявке.

- [ ] **Step 5: Запустить тест**

Run: `cd apps/api && go test ./internal/modules/support/ -run TestCuratorGuide -v`
Expected: PASS.

- [ ] **Step 6: Убедиться, что руководство пользователя не затронуто**

Run: `git diff --stat docs/user-guide/`
Expected: пусто — для человека снаружи ничего не меняется, и `make sync-knowledge` не нужен.

Run: `cd apps/api && go test ./internal/modules/support/`
Expected: PASS, включая `TestKnowledgeMatchesUserGuide`.

- [ ] **Step 7: Commit**

```bash
git add docs/curator-guide/ apps/api/internal/modules/support/curator_guide_test.go
git commit -m "docs(curator-guide): работа с заявками и догон пользователей"
```

---

### Task 8: Сквозная проверка и выкатка

**Files:**
- Create: `e2e/curator-leads.spec.ts`
- Modify: `openspec/changes/curator-lead-workspace/tasks.md`

- [ ] **Step 1: Написать E2E-сценарий с двумя ролями**

```ts
test('куратор разбирает очередь заявок, обычный пользователь туда не попадает', async ({ browser }) => {
    const curator = await signInAs(browser, 'coordinator')
    await curator.goto('http://localhost:3070/curator/leads')
    await expect(curator.getByRole('heading', { name: /заявки/i })).toBeVisible()

    await curator.getByRole('button', { name: /обработана/i }).first().click()
    await expect(curator.getByText(/обработана/i)).toBeVisible()

    const user = await signInAs(browser, 'user')
    await user.goto('http://localhost:3070/curator/leads')
    await expect(user.getByText(/нет доступа/i)).toBeVisible()
})
```

- [ ] **Step 2: Прогнать E2E явно на 3070**

Run: `E2E_BASE_URL=http://localhost:3070 npm run test:e2e -- curator-leads`
Expected: PASS.

- [ ] **Step 3: Прогнать проверки целостности**

Run: `node scripts/check-api-contract.mjs && node scripts/check-codebase-integrity.mjs`
Expected: без ошибок.

- [ ] **Step 4: Прогнать полный набор тестов**

Run: `cd apps/api && go test ./... && go test -tags=integration ./...`
Run: `cd apps/web && npx jest --coverage`
Run: `npm run test:e2e`
Expected: PASS; покрытие не ниже порогов.

- [ ] **Step 5: Проверить на dev обеими ролями**

От куратора: обе очереди открываются, заявка отмечается, повторная отметка сообщает, что её уже взяли, переход к переписке работает, у заявки без согласия действия «Написать» нет.
От обычного пользователя: оба пути отвечают отказом.
От супер-администратора: доступ сохранился.

Наблюдения приложить к PR.

- [ ] **Step 6: Выкатить на прод и повторить проверку всеми тремя ролями**

- [ ] **Step 7: Отметить задачи в предложении по факту проверенного**

- [ ] **Step 8: Commit**

```bash
git add e2e/curator-leads.spec.ts openspec/changes/curator-lead-workspace/tasks.md
git commit -m "test(e2e): кураторская очередь заявок и отказ посторонним"
```

---

## Self-Review

**Покрытие спеки:**

| Требование | Задача |
|---|---|
| Очередь заявок у куратора | 3, 6 |
| Состав записи в очереди | 3, 6 |
| Запрет связи без согласия отображается явно | 3, 6 |
| Взятие заявки в работу | 4, 6 |
| Очередь не даёт изменять и удалять заявки | 1 (маршрутов изменения и удаления не существует) |
| Доступ к заявкам | 1 |
| Доступ к разговорам поддержки | 2 |
| Заявки и разговоры вне группы клиентских маршрутов | 1, 2 |
| Единственный путь к заявкам и разговорам | 1, 2, 5 |
| Разбор эскалированных разговоров | 2 |

**Известные допущения, которые исполнитель обязан проверить перед началом:**

1. Требование «Очередь не даёт изменять и удалять заявки» выполняется тем, что таких маршрутов нет вовсе. Если `TestAuthorizationMatrixIsComplete` или ревью потребуют явной проверки — добавить тест, убеждающийся, что `PUT` и `DELETE` на `/curator/leads/:id` отвечают `404`, а не `405`.
2. Ответ куратора в веб-разговор (спека `support-escalation`) реализуется предложением `public-support-widget`, задача 3. Здесь он только проверяется — если это изменение выкатывается раньше, соответствующие сценарии в E2E пропустить и отметить в PR, а не тихо удалить.
3. Имена вспомогательных функций тестов (`routerForTest`, `getAs`, `seedLead`, `daysAgo`) названы по смыслу — использовать существующие эквиваленты из `internal/router` и `internal/modules/leads`, если они есть.
4. Как именно устроена навигация кураторского рабочего места (задача 5, шаг 5) — посмотреть перед правкой; в плане она названа, но её структура не зафиксирована.
