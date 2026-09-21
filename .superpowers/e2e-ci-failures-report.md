# Отчёт: четыре падения E2E в CI (PR #112)

**Ветка:** `fix/e2e-ci-failures`, от свежего `origin/dev` (`dffa5713`).
**Изменённые файлы:**
- `.github/workflows/e2e.yml` — добавлены заглушечные учётные данные бота поддержки + защитный `LLM_BASE_URL`.
- `e2e/tests/error-screens.spec.ts` — обновлено ожидаемое сообщение об ошибке.

## Как проверялось

Своя изолированная CI-копия стенда (не трогал соседние worktree и их порты/базы):
- Postgres 18-alpine в отдельном контейнере (`podman`), порт 5440, БД `burcev_e2e`.
- Mailpit в отдельном контейнере, порты 1035/8035.
- API — реальный собранный бинарник (`go build ./cmd/server`), реальные миграции применяются при старте.
- Web — **продакшн-сборка** (`next build && next start`, не `next dev`) — важно: сервис-воркер (`serwist`) регистрируется только в собранном фронтенде, и именно на нём воспроизводилась находка задачи 10 про перехват запросов.
- `scripts/dev-proxy.mjs` перед web+API — та же схема маршрутизации, что и в проде/CI.
- Playwright гонялся с явным `E2E_BASE_URL=http://localhost:3272` (иначе `e2e/.env` молча увёл бы прогон на `https://new.burcev.team`) и явными `E2E_*` учётными данными, совпадающими с тем, что реально засеяно `cmd/seed-e2e`.

Для «before»-прогонов backend запускался с **тем же набором переменных, что и неизменённый `e2e.yml`** — при этом пришлось дважды убирать из `apps/api/.env` (локальный, гитигнорённый, оставшийся от прошлой задачи) заглушечные support-креды: `config.Load()` читает `.env` через `godotenv.Load()` независимо от явно заданных в shell переменных, и первая попытка репродукции была случайно «зелёной» именно из-за этого файла. Без него — падения воспроизвелись один в один, вплоть до номеров строк.

---

## 1. `error-screens.spec.ts:49` — «онбординг переживает недоступный API»

**Причина.** Тест бьёт по `POST /api/v1/public/nutrition/calculate` через `route.abort('failed')` — это симулирует **разрыв соединения**, а не отказ сервера. До коммита `937589ab` («причина отказа доезжает до человека») любая ошибка в `GuestOnboarding.tsx` показывала одну и ту же заготовку — «Не удалось выполнить расчёт. Проверьте параметры.» После `937589ab` код различает вид ошибки (`apiErrors.ts`): `route.abort` даёт `NetworkError`, для которого `messageFor()` возвращает **более точный** текст — «Нет связи с сервером. Проверьте интернет-соединение и попробуйте снова.» Заготовка `onboarding.guest.calcFailed` теперь используется только когда `messageForOr` не может распознать вид ошибки (обычный `Error` без `kind`). Тест ждал старый (более не достижимый для этого сценария) текст. Гипотеза, названная в задании, подтвердилась: это не дефект, а тест, не догнавший поведение, которое стало честнее.

**До (оригинальный текст теста, воспроизведено):**
```
✘  Error screens › the onboarding survives an API that is not there
   Error: expect(locator).toBeVisible() failed
   Locator: getByText(/Не удалось выполнить расчёт/)
   Timeout: 15000ms
   Error: element(s) not found
     at e2e/tests/error-screens.spec.ts:49:65
  1 failed, 2 passed
```

**Правка.** Утверждение заменено на точный (не ослабленный) текст нового поведения, с комментарием, откуда он взялся:
```ts
await expect(
    page.getByText(/Нет связи с сервером\. Проверьте интернет-соединение и попробуйте снова\./)
).toBeVisible({ timeout: 15000 })
```

**После:**
```
✓  Error screens › a wrong URL explains itself and offers a way back
✓  Error screens › a failed request leaves the page usable
✓  Error screens › the onboarding survives an API that is not there
  3 passed (1.4s)
```

**Мутация (обязательная проверка).** В `GuestOnboarding.tsx` временно заменил `catch`:
```ts
} catch (err) {
    void err
    toast.error(t('onboarding.guest.calcFailed'))   // голая заготовка, причина не читается
}
```
Пересобрал прод-сборку, перезапустил web, прогнал тест **с той же (уже исправленной) версией спека** — он покраснел ровно там, где и должен:
```
✘  Error screens › the onboarding survives an API that is not there
   Locator: getByText(/Нет связи с сервером\. Проверьте интернет-соединение и попробуйте снова\./)
   Timeout: 15000ms — element(s) not found
     at e2e/tests/error-screens.spec.ts:56:7
  1 failed, 2 passed
```
Откатил мутацию (`git diff` по файлу — пусто), пересобрал, перепроверил зелёным.

**Дефект приложения?** Нет. Поведение после `937589ab` строго лучше прежнего (конкретная причина вместо общей фразы); тест был просто не обновлён вслед за ним.

---

## 2–4. `support-widget.spec.ts:189, 249, 296`

**Причина (одна на все три).** `openWidgetForReal()` бьёт по-настоящему в `POST /api/v1/public/support/web` (`StartWeb`) и читает `body.data.conversation_id`. В `.github/workflows/e2e.yml` не было ни одной из четырёх переменных, включающих способность бота поддержки (`config.Features.SupportBot`, `apps/api/internal/config/config.go:469`): `LLM_API_KEY`, `SUPPORT_MODEL`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`. Без них `h.service == nil` (`support/handler.go:26-28`), и **все** веб-маршруты поддержки, включая `StartWeb`, отвечают `503` с телом `{"status":"error","message":"Бот поддержки не настроен","code":"feature_unavailable"}` — без `data` вовсе. Отсюда `body.data.conversation_id` → `TypeError: Cannot read properties of undefined`. Четвёртый тест файла (`route.abort` на `.../web`, без чтения `conversation_id`) не пострадал — это ровно совпадает с тем, что упали именно 3 из 4 сценариев файла.

Подтверждено не только логически, но и вживую: `curl -X POST /api/v1/public/support/web` на backend без этих переменных дал точно этот `503`/JSON; тот же backend с ними — нормальный `{"data":{"conversation_id":...,"token":...}}`.

**До (воспроизведено прогоном Playwright против backend без support-креды, как в неизменённом `e2e.yml`):**
```
✓  при недоступном API виджет объясняет причину и не роняет страницу
✘  гость спрашивает бота, зовёт человека... (support-widget.spec.ts:189)
✘  заявка из разговора видна кураторской очереди... (support-widget.spec.ts:249)
✘  потолок сообщений в разговоре отвечает внятной причиной... (support-widget.spec.ts:296)

TypeError: Cannot read properties of undefined (reading 'conversation_id')
  86 |     const conversationId: string = body.data.conversation_id
     at openWidgetForReal (e2e/tests/support-widget.spec.ts:86:46)
  3 failed, 1 passed
```

**Правка** — `.github/workflows/e2e.yml`, добавлены в `env:`:
```yaml
LLM_API_KEY: e2e-placeholder-not-a-real-key
SUPPORT_MODEL: gpt://e2e-placeholder/yandexgpt/latest
TELEGRAM_BOT_TOKEN: '000000:e2e-placeholder-token'
TELEGRAM_WEBHOOK_SECRET: e2e-placeholder-secret
LLM_BASE_URL: http://127.0.0.1:1/e2e-placeholder-must-not-be-dialed
```
Первые четыре включают способность (только проверка на непустоту, без проверки формата — `config.go` этого не требует). Пятая — отдельный защитный слой, см. ниже.

**После:**
```
✓  a wrong URL explains itself and offers a way back
✓  a failed request leaves the page usable
✓  the onboarding survives an API that is not there
✓  потолок сообщений в разговоре отвечает внятной причиной, а не общей фразой
✓  при недоступном API виджет объясняет причину и не роняет страницу
✓  гость спрашивает бота, зовёт человека, оставляет контакт с согласиями — и разговор переживает перезагрузку
✓  заявка из разговора видна кураторской очереди с сохранённым согласием на связь
  7 passed (3.0s)
```

**Дефект приложения?** Нет. `SupportBot`, выведенный из наличия кредов, и честный `503` при их отсутствии — это ровно то поведение, которое описано в CLAUDE.md («Optional Capabilities») и было сделано намеренно. Пробел был в `e2e.yml`: воркфлоу никогда не включал эту способность, поэтому единственный полный прогон (первый раз, когда сьют вообще запустился на пути в `main`) и поймал разрыв между «что мы думаем гоняется» и «что гоняется на самом деле».

### Может ли CI уйти к живой модели — проверено, а не предположено

Спек подменяет `POST .../web/message` через `page.route` в браузере — сам он никогда не должен долетать до бэкенда. Но это Playwright-подмена, не серверная гарантия: если её перехват по какой-то причине не сработает (порядок роутов, взаимодействие с сервис-воркером — именно такой случай нашла задача 10 на этом же файле), запрос **дойдёт до настоящего бэкенда**, который с включённым `SupportBot` иначе честно позвонил бы на `https://llm.api.cloud.yandex.net` (константа `DefaultBaseURL`, `internal/shared/llm/client.go:29`) — с фальшивым ключом, но по-настоящему, наружу из CI.

Закрыл это `LLM_BASE_URL` (переопределяет `cfg.LLMBaseURL` → `llm.NewClient(...).WithEndpoint(...)`, `main.go:339-340`) — направил провайдера на `127.0.0.1:1`, где никто не слушает. Проверено вживую, не только по коду: поднял backend с этими же переменными и **напрямую curl'ом** (в обход браузера и подмены) вызвал `POST /api/v1/public/support/web/message` с настоящим токеном от настоящего `StartWeb`. Результат:
- ответ пришёл за **~20 мс** (`{"status":"success"}`) — мгновенный локальный `connection refused`, никакого сетевого похода наружу;
- в переписке (`GET .../web/messages`) обнаружился настоящий, но graceful путь: `HandleMessage` (`service.go:228`) трактует отказ модели как `escalate(..., "ошибка обращения к модели")` — статус разговора стал `escalated`, гостю показано «Не нашёл ответа в документации... Передал ваш вопрос человеку».

То есть даже при полном отказе Playwright-подмены реальный запрос никуда не долетает до внешнего провайдера — падает локально и мгновенно, приложение штатно эскалирует на человека. Утечки живого запроса к модели из CI нет ни при каком раскладе, который я смог проверить.

---

## Прогоны

```
$ npx playwright test --project=auth-tests e2e/tests/support-widget.spec.ts e2e/tests/error-screens.spec.ts --reporter=list
  7 passed (3.0s)

$ node scripts/check-codebase-integrity.mjs
Codebase integrity OK — 4 public env vars all used, 1 Next.js config, no unimplemented
shipped handlers, 118 app files free of fixture data, 48 e2e specs all in a project,
21 analytics events all sent, 81 server env vars all forwarded by compose.

$ node scripts/check-api-contract.mjs
API contract OK — 104 frontend paths all resolve to registered routes.

$ cd apps/web && npm run type-check
> tsc --noEmit
(чисто, без ошибок)

$ cd apps/web && npx jest src/features/onboarding/components/__tests__/GuestOnboarding.test.tsx
Test Suites: 1 passed, 1 total
Tests:       24 passed, 24 total
```

Go-сторону не трогал (изменения только в `.github/workflows/e2e.yml` и e2e-спеке), поэтому `go test ./...` не перепрогонял целиком — новых путей в роутере/авторизационной матрице нет.

## Итог

| # | Файл | Причина | Дефект приложения? |
|---|------|---------|---------------------|
| 1 | `error-screens.spec.ts:49` | Тест не догнал более точное сообщение об ошибке после `937589ab` | Нет — поведение приложения стало лучше, тест был устаревшим |
| 2–4 | `support-widget.spec.ts:189,249,296` | `e2e.yml` не включал `SupportBot` (не хватало 4 переменных) → `StartWeb` отвечал `503` без `data` | Нет — `503` при отсутствии кредов задуман; пробел был в конфигурации CI |

**Настоящего дефекта приложения среди четырёх падений нет.** Оба — расхождения между тестом/окружением CI и (корректным) реальным поведением: одно тест не обновил вслед за более честным сообщением об ошибке, другое — воркфлоу никогда не включал способность, которую спек предполагает включённой, и это впервые проявилось только сейчас, на первом полном прогоне сьюта.
