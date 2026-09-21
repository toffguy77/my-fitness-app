# Отчёт: мигающий тест `support-widget.spec.ts:189`

**Ветка:** `fix/widget-spec-ambiguous-locator`, от свежего `origin/main`.

**Вывод коротко: это селектор, а не дефект приложения.** Гость **не** видит
свой вопрос дважды — второе совпадение находилось не во второй копии
сообщения в переписке, а в самой `<textarea>` вопроса, которая на мгновение
ещё показывала введённый текст, пока переписка уже успела обновиться.
Подробности и доказательства — ниже.

## Как воспроизводилось

Своя изолированная копия стенда по схеме CI, ничего в соседних worktree не
трогал:
- Postgres 18-alpine в отдельном контейнере (podman), порт 5441, БД
  `burcev_e2e`.
- Mailpit в отдельном контейнере, порты 1036/8036.
- API — реальный собранный бинарник (`go build ./cmd/server`), порт 4001,
  миграции применяются при старте, `cmd/seed-e2e` засеивает тестовые
  аккаунты.
- Web — **продакшн-сборка** (`next build && next start -p 3071`), не
  `next dev` — сервис-воркер (serwist) собирается и регистрируется только в
  ней, как в CI.
- `scripts/dev-proxy.mjs` (`PROXY_PORT=3072`) впереди web+API — та же схема
  маршрутизации, что в проде и в `e2e.yml`.
- `LLM_API_KEY`/`SUPPORT_MODEL`/`TELEGRAM_BOT_TOKEN`/`TELEGRAM_WEBHOOK_SECRET`
  + защитный `LLM_BASE_URL=http://127.0.0.1:1/...` — та же способность
  `SupportBot`, что включена в `.github/workflows/e2e.yml` (см.
  `.superpowers/e2e-ci-failures-report.md`, задачи 2–4).
- Playwright — с явным `E2E_BASE_URL=http://localhost:3072` и явными
  `E2E_*` учётками, совпадающими с `cmd/seed-e2e` (без `e2e/.env`, чтобы не
  уехать на dev — `project_e2e_env_redirects_to_dev`).

## Что именно нашлось

`getByText('что даст регистрация?')` без скоупа резолвился в диалоге в два
узла:

1. `<p><span>Вы: </span>что даст регистрация?</p>` — абзац в переписке
   (`div[role="log"]`, было просто `div[aria-live="polite"]` без роли).
2. `<textarea id="support-widget-question">что даст регистрация?</textarea>`
   — **та же самая** `<textarea>` вопроса, ещё не очищенная.

Причина — в `SupportWidget.tsx` (`handleSend`) и `widgetStore.ts`
(`sendMessage`):

```ts
const handleSend = async (event) => {
    ...
    await sendMessage(text)   // 1) set({sending:true}) 2) POST /message
                               //    3) await refreshMessages() → set({messages,status})
                               //    4) set({sending:false})
    setQuestion('')           // <-- очищает textarea ТОЛЬКО после того,
                               //     как сообщение уже показано в переписке
    setAskedOnce(true)
}
```

`refreshMessages()` кладёт новый `messages` в стор **до** того, как
`handleSend` дойдёт до `setQuestion('')` — это два отдельных коммита React
(подтверждено `MutationObserver`, разница между ними ~0.1мс). Контролируемая
`<textarea value={question}>` в React рендерится через дочерний текстовый
узел (так работает html `<textarea>`), поэтому пока `question` ещё не
очищен, её живой DOM реально содержит тот же текст, что и абзац в переписке.
Окно — суб-кадровое (доли миллисекунды), человек его никогда не увидит: оба
обновления попадают в один и тот же кадр отрисовки браузера почти всегда.
Но Playwright иногда успевает опросить DOM ровно в этом окне (особенно на
загруженном CI-раннере) — отсюда «упал с первой попытки, прошёл со второй».

### Прямое доказательство (до правки)

Скрипт с `MutationObserver`, слушающий каждую мутацию DOM диалога и
подсчитывающий узлы с искомым текстом (не полагаясь на угадывание тайминга
опроса, как обычный polling):

```
run 0 (до правки): raw-dialog-duplicate=true
  Совпадение 1: <p><span>Вы: </span>что даст регистрация?</p>
  Совпадение 2: <textarea id="support-widget-question">что даст регистрация?</textarea>
```

Второе совпадение — **всегда** `<textarea>`, никогда вторая копия абзаца в
переписке. Проверено раскруткой `messages.map(...)`: React получает один и
тот же массив из `refreshMessages()` (полная замена стора, не добавление);
дублирующего пуша сообщений в моке-перехвате `page.route` тоже нет — каждый
вызов `SEND_MESSAGE_PATH` кладёт ровно одну пару user/bot.

## Правка

**Селектор**, не виджет. Два изменения:

1. `apps/web/src/features/support/components/SupportWidget.tsx` — контейнеру
   переписки добавлена `role="log"` (семантически верно для истории чата,
   заодно и стабильный, независимый от `<textarea>` якорь для локатора):
   ```tsx
   <div
       role="log"
       aria-live="polite"
       aria-label={t('supportWidget.title')}
       ...
   >
   ```
2. `e2e/tests/support-widget.spec.ts` — обе уязвимые проверки (сразу после
   `fill()+click()`, до того как поле успевает очиститься) теперь скоупятся
   внутрь `role="log"`, а не всего диалога:
   ```ts
   await expect(dialog.getByRole('log').getByText('что даст регистрация?')).toBeVisible()
   ...
   await expect(dialog.getByRole('log').getByText('как работает дневник?')).toBeVisible()
   ```
   Третья такая же проверка (строка 245, после `page.reload()`) не тронута:
   там `<textarea>` свежая и пустая с момента маунта, гонки нет.

### Прямое доказательство (после правки), тот же race

В том же прогоне, где `MutationObserver` поймал дубль на уровне сырого
`role="dialog"`, скоуп внутри `role="log"` дубль **не увидел**:

```
run 0: raw-dialog-duplicate=true scoped-log-duplicate=false
```

То есть корневая гонка в DOM никуда не делась (и не обязана — она
суб-кадровая и безвредная), но новый локатор её больше не путает с
настоящим дублированием сообщения.

## Прогоны

### Обязательный сценарий, повторно (устойчивость)

```
$ npx playwright test --project=auth-tests tests/support-widget.spec.ts --reporter=list --repeat-each=5
  20 passed (9.9s)

$ npx playwright test --project=auth-tests tests/support-widget.spec.ts --reporter=list --repeat-each=15 --workers=2
  60 passed (25.6s)
```

75 прогонов сценария (15+60) подряд, без единого падения.

### Остальные обязательные проверки

```
$ cd apps/web && npx jest src/features/support
Test Suites: 3 passed, 3 total
Tests:       46 passed, 46 total

$ cd apps/web && npm run type-check
> tsc --noEmit
(чисто)

$ node scripts/check-codebase-integrity.mjs
Codebase integrity OK — 4 public env vars all used, 1 Next.js config, no unimplemented
shipped handlers, 118 app files free of fixture data, 48 e2e specs all in a project,
21 analytics events all sent, 81 server env vars all forwarded by compose.

$ node scripts/check-api-contract.mjs
API contract OK — 104 frontend paths all resolve to registered routes.
```

Backend не менялся — `go test ./...` не перепрогонял целиком, изменений в
`internal/router/` и авторизационной матрице нет.

## Итог

| Вопрос | Ответ |
|---|---|
| Что это — селектор или дефект приложения? | **Селектор.** `getByText` без скоупа ловил и абзац переписки, и ещё не очищенную `<textarea>` вопроса. |
| Видел ли человек свой вопрос дважды? | **Нет.** Окно между обновлением переписки и очисткой поля — суб-кадровое (~0.1мс между двумя React-коммитами, измерено `MutationObserver`); оба попадают в один и тот же кадр отрисовки. Видимого дублирования на экране не было и нет. |
| Правка виджета нужна? | Нет, кроме `role="log"` — семантически корректное добавление ARIA-роли истории чата, не поведенческое изменение. |
| Устойчивость доказана? | Да: 75 повторов сценария подряд (5+15×4) зелёные; тот же race, что дал ложный дубль в сыром `role="dialog"`, подтверждённо не задевает `role="log"`. |
