import type { Page } from '@playwright/test'

import { test, expect, signIn, asUser } from '../fixtures/session'

/**
 * Разговор с ботом поддержки на посадочной — до регистрации.
 *
 * Главное отличие от соседних спеков: гость не проходит через
 * `e2e/fixtures/session.ts`. Виджет обходится без сессии — токен разговора
 * выдаёт сам `POST /api/v1/public/support/web`, и живёт он в localStorage
 * браузера (support/api/widget.ts, WIDGET_TOKEN_KEY), а не в cookie.
 *
 * Живую модель этот файл не зовёт ни разу — она стоит денег, недетерминирована
 * и упирается в общий дневной потолок. `POST .../web/message` перехватывается
 * через `page.route`, тем же приёмом, что и `**\/api/v1/food-tracker/recognize`
 * в food-recognition.spec.ts, а не письмом ответа боту напрямую в БД: так
 * подмена видна тому же коду, что видит и настоящий ответ, — виджету всё равно,
 * откуда пришёл JSON.
 *
 * Подмена работает не одна: `StartWeb`, `WebHuman` и `WebContact` идут по-настоящему
 * в реальный бэкенд (задача 9's дневная БД), так что «позвать человека» и
 * «оставить контакт» проверяются целиком, вплоть до строки в leads. Перехват
 * `.../web/human` не подменяет ответ — только подглядывает за реальным
 * (`route.continue()`), чтобы синхронизировать локальную подмену `.../web/messages`
 * со статусом, который только что по-настоящему сменился в БД на `escalated`.
 *
 * Токен разговора, который эти подмены обязаны предъявить, — настоящий,
 * прочитанный из ответа настоящего `StartWeb`: подмена, зарегистрированная как
 * «любой токен подходит», не заметила бы регресс, при котором виджет после
 * перезагрузки послал бы не тот токен или не послал бы никакого.
 *
 * Уборка: разговор нельзя удалить (support_conversations — только закрыть, у
 * записи нет DELETE), поэтому `afterEach` закрывает его через кураторский
 * `POST /curator/support/conversations/:id/close` — лучшее, что даёт API, и
 * делает это независимо от исхода теста, как и `curator-leads.spec.ts`.
 * Заявка (leads), если тест успел её оставить, снимается безусловно через
 * `/public/leads/unsubscribe`, тем же путём, что и там.
 *
 * `serviceWorkers: 'block'` — не косметика. Собранный (production) фронтенд
 * регистрирует настоящий service worker (задача 8, serwist.config.mjs), и
 * `clientsClaim: true` даёт ему забрать страницу под управление в разгар
 * теста. С этого момента `page.route()` перестаёт видеть запросы, идущие
 * через воркер, — не только новые, но и уже подменённые: после
 * `page.reload()` GET `.../web/messages` уходил напрямую в настоящий бэкенд
 * мимо подмены, и вместо заданного вопроса на экране оказывался настоящий
 * (но единственный и другой) ответ эскалации из БД. Воспроизведено и
 * подтверждено выключением воркера: без него сценарий с «Позвать человека» +
 * «Сохранить контакт» перед перезагрузкой падал детерминированно, а не
 * изредка.
 */

test.use({ role: undefined, serviceWorkers: 'block' })

const SEND_MESSAGE_PATH = '**/api/v1/public/support/web/message'
const READ_MESSAGES_PATH = '**/api/v1/public/support/web/messages*'
const CALL_HUMAN_PATH = '**/api/v1/public/support/web/human'

interface FakeMessage {
    id: string
    author: 'user' | 'bot' | 'operator'
    text: string
    created_at: string
}

/** Тело отказа в форме, которую реально отдаёт handler.go (response.ErrorCode). */
function errorBody(message: string, code: string) {
    return { status: 'error', message, code }
}

/**
 * Открывает виджет по-настоящему: клик по кнопке ведёт к настоящему
 * `POST /api/v1/public/support/web`, и из его ответа берётся id разговора —
 * для уборки — а из localStorage — токен, которым эта подмена дальше
 * проверяет каждый перехваченный запрос.
 */
async function openWidgetForReal(page: Page): Promise<{ conversationId: string; token: string }> {
    const [response] = await Promise.all([
        page.waitForResponse(
            (res) =>
                res.request().method() === 'POST' &&
                new URL(res.url()).pathname === '/api/v1/public/support/web'
        ),
        page.getByRole('button', { name: 'Задать вопрос' }).click(),
    ])
    const body = await response.json()
    const conversationId: string = body.data.conversation_id
    const token = await page.evaluate(() => localStorage.getItem('support_web_token'))
    expect(token, 'StartWeb должен был оставить токен в localStorage').toBeTruthy()
    return { conversationId, token: token as string }
}

/**
 * Подменяет ответ модели и чтение переписки, оставляя «Позвать человека»
 * настоящим (см. пояснение в шапке файла). `botReply` — то, что подставляется
 * вместо ответа модели на любой заданный вопрос.
 */
async function interceptModelAnswers(
    page: Page,
    token: string,
    botReply: (question: string) => string
): Promise<{ setStatus: (status: 'open' | 'escalated') => void }> {
    const transcript: FakeMessage[] = []
    let status: 'open' | 'escalated' = 'open'
    let nextId = 1
    const now = () => new Date().toISOString()

    await page.route(SEND_MESSAGE_PATH, async (route) => {
        const req = route.request().postDataJSON() as { token?: string; text?: string }
        if (req.token !== token) {
            await route.fulfill({
                status: 404,
                contentType: 'application/json',
                body: JSON.stringify(errorBody('Чат не найден — откройте его заново', 'not_found')),
            })
            return
        }
        transcript.push({ id: String(nextId++), author: 'user', text: req.text ?? '', created_at: now() })
        transcript.push({
            id: String(nextId++),
            author: 'bot',
            text: botReply(req.text ?? ''),
            created_at: now(),
        })
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'success' }) })
    })

    await page.route(READ_MESSAGES_PATH, async (route) => {
        const url = new URL(route.request().url())
        if (url.searchParams.get('token') !== token) {
            await route.fulfill({
                status: 404,
                contentType: 'application/json',
                body: JSON.stringify(errorBody('Чат не найден — откройте его заново', 'not_found')),
            })
            return
        }
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ status: 'success', data: { messages: transcript, status } }),
        })
    })

    // Не подменяет ответ — «Позвать человека» бьёт по настоящему бэкенду, и
    // именно он переводит разговор в 'escalated' в БД. Перехват только
    // подглядывает за этим, чтобы подменённый .../messages честно отражал
    // случившееся, вместо того чтобы держать свой собственный, разъехавшийся
    // статус.
    await page.route(CALL_HUMAN_PATH, async (route) => {
        status = 'escalated'
        await route.continue()
    })

    return { setStatus: (s) => (status = s) }
}

test.describe('Виджет поддержки на посадочной (гость, без аккаунта)', () => {
    // Очереди на уборку, а не built-up в конце теста: то, что тест успел
    // создать до падения, обязано быть снято и на красном прогоне —
    // `afterEach` в Playwright выполняется независимо от исхода.
    const conversationIds: string[] = []
    const leadTokens: string[] = []

    test.afterEach(async ({ context, baseURL }) => {
        const tokens = leadTokens.splice(0, leadTokens.length)
        for (const token of tokens) {
            await context.request
                .get(`${baseURL}/api/v1/public/leads/unsubscribe?token=${encodeURIComponent(token)}`)
                .catch(() => {})
        }

        const ids = conversationIds.splice(0, conversationIds.length)
        if (ids.length === 0) return
        try {
            const curatorToken = await signIn(context, baseURL!, 'curator')
            for (const id of ids) {
                await context.request
                    .post(`${baseURL}/api/v1/curator/support/conversations/${id}/close`, {
                        headers: asUser(curatorToken),
                    })
                    .catch(() => {})
            }
        } catch {
            // Уборка — лучшее усилие: сломавшийся вход куратора не должен
            // прятать собственный отказ теста за отказом afterEach.
        }
    })

    test('гость спрашивает бота, зовёт человека, оставляет контакт с согласиями — и разговор переживает перезагрузку', async ({
        page,
    }) => {
        await page.goto('/')

        const { conversationId, token } = await openWidgetForReal(page)
        conversationIds.push(conversationId)
        // Посадочная сама то и дело упоминает «дневник» (герой, карточки
        // возможностей) — текст переписки проверяется внутри панели виджета,
        // а не по всей странице, иначе слово нашлось бы и без единого
        // сообщения от бота.
        const dialog = page.getByRole('dialog', { name: 'Вопрос без регистрации' })

        await interceptModelAnswers(
            page,
            token,
            () => 'Аккаунт превращает разовый расчёт в постоянный дневник питания.'
        )

        await dialog.getByRole('textbox', { name: 'Ваш вопрос' }).fill('что даст регистрация?')
        await dialog.getByRole('button', { name: 'Отправить' }).click()

        // Собственный вопрос гостя остался в переписке — скоуп внутри
        // `role="log"` (не всего диалога), потому что до `setQuestion('')`
        // тот же текст на мгновение всё ещё сидит и в textarea вопроса:
        // React обновляет её содержимое как дочерний текстовый узел (так
        // работает контролируемый `<textarea>`), а очистка поля происходит
        // отдельным вызовом set state уже после того, как сообщение
        // появилось в переписке. Без скоупа `getByText` иногда — в узком
        // окне между этими двумя обновлениями — находил тот же текст
        // дважды и падал с strict mode violation (мигающий тест в релизном
        // прогоне). Подтверждено вживую через MutationObserver: второе
        // совпадение всегда было внутри <textarea>, не второй копией в
        // переписке.
        await expect(dialog.getByRole('log').getByText('что даст регистрация?')).toBeVisible()
        // ...и ответ пришёл по базе знаний, а не общей фразой.
        await expect(dialog.getByText(/дневник/i)).toBeVisible()

        await dialog.getByRole('button', { name: 'Позвать человека' }).click()

        // Настоящая эскалация: контактная форма появляется только когда
        // реальный WebHuman действительно перевёл разговор в 'escalated' —
        // не потому, что подмена решила показать её сама.
        await dialog.getByLabel('Почта').fill('widget-e2e@example.com')
        await dialog.getByRole('checkbox', { name: /обработку/i }).check()
        await dialog.getByRole('checkbox', { name: /могут написать/i }).check()

        const [contactResponse] = await Promise.all([
            page.waitForResponse(
                (res) =>
                    res.request().method() === 'POST' &&
                    new URL(res.url()).pathname === '/api/v1/public/support/web/contact'
            ),
            dialog.getByRole('button', { name: 'Сохранить контакт' }).click(),
        ])
        const contactBody = await contactResponse.json()
        const leadToken: string | undefined = contactBody?.data?.token
        expect(leadToken, 'WebContact должен был вернуть токен заявки для уборки').toBeTruthy()
        if (leadToken) leadTokens.push(leadToken)

        await expect(dialog.getByText(/ответим/i)).toBeVisible()

        // Переписка переживает перезагрузку: токен лежит в localStorage, и
        // после возврата на страницу виджет подхватывает тот же разговор —
        // не пустой, а с тем самым вопросом гостя.
        await page.reload()
        await page.getByRole('button', { name: 'Задать вопрос' }).click()
        await expect(dialog.getByText('что даст регистрация?')).toBeVisible()
        await expect(dialog.getByText(/дневник/i)).toBeVisible()
    })

    test('заявка из разговора видна кураторской очереди с сохранённым согласием на связь', async ({
        page,
        context,
        baseURL,
    }) => {
        await page.goto('/')

        const { conversationId, token } = await openWidgetForReal(page)
        conversationIds.push(conversationId)
        const dialog = page.getByRole('dialog', { name: 'Вопрос без регистрации' })
        await interceptModelAnswers(page, token, () => 'Отвечаю по базе знаний.')

        await dialog.getByRole('textbox', { name: 'Ваш вопрос' }).fill('как работает дневник?')
        await dialog.getByRole('button', { name: 'Отправить' }).click()
        // Скоуп внутри `role="log"` — та же причина, что в первом сценарии
        // файла (см. комментарий там): текст на мгновение задваивается с
        // ещё не очищенной textarea вопроса, если не сузить локатор до
        // самой переписки.
        await expect(dialog.getByRole('log').getByText('как работает дневник?')).toBeVisible()

        await dialog.getByRole('button', { name: 'Позвать человека' }).click()

        const email = `widget-e2e-${Date.now()}@example.com`
        await dialog.getByLabel('Почта').fill(email)
        await dialog.getByRole('checkbox', { name: /обработку/i }).check()
        await dialog.getByRole('checkbox', { name: /могут написать/i }).check()

        const [contactResponse] = await Promise.all([
            page.waitForResponse(
                (res) =>
                    res.request().method() === 'POST' &&
                    new URL(res.url()).pathname === '/api/v1/public/support/web/contact'
            ),
            dialog.getByRole('button', { name: 'Сохранить контакт' }).click(),
        ])
        const contactBody = await contactResponse.json()
        const leadToken: string | undefined = contactBody?.data?.token
        if (leadToken) leadTokens.push(leadToken)

        await signIn(context, baseURL!, 'curator')
        await page.goto('/curator/leads')
        await expect(page.getByRole('heading', { name: 'Заявки' })).toBeVisible({ timeout: 20000 })

        const card = page.getByTestId('lead-card').filter({ hasText: email })
        await expect(card).toBeVisible({ timeout: 10000 })
        // Согласие на связь было отмечено в виджете — «Написать» видна, а не
        // «Согласия на связь нет» (curator-leads.spec.ts проверяет обратный
        // случай на этой же разметке).
        await expect(card.getByRole('link', { name: 'Написать' })).toBeVisible()
    })

    test('потолок сообщений в разговоре отвечает внятной причиной, а не общей фразой', async ({ page }) => {
        await page.goto('/')

        const { conversationId, token } = await openWidgetForReal(page)
        conversationIds.push(conversationId)
        const dialog = page.getByRole('dialog', { name: 'Вопрос без регистрации' })

        // Число сообщений, при котором сервер реально отказывает
        // (MaxWebMessagesPerConversation, support/handler.go), никогда не
        // достигается по-настоящему здесь: 30 настоящих сообщений — это 30
        // настоящих вызовов модели, ровно то, чего этот файл избегает.
        // Подменяется прямой ответ сервера — тот же 429 с тем же кодом и
        // тем же текстом, что отдаёт enforceWebMessageCap (support/web.go).
        await page.route(SEND_MESSAGE_PATH, async (route) => {
            const req = route.request().postDataJSON() as { token?: string }
            if (req.token !== token) {
                await route.fulfill({
                    status: 404,
                    contentType: 'application/json',
                    body: JSON.stringify(errorBody('Чат не найден — откройте его заново', 'not_found')),
                })
                return
            }
            await route.fulfill({
                status: 429,
                contentType: 'application/json',
                body: JSON.stringify(
                    errorBody('В этом чате слишком много сообщений — позовите человека', 'rate_limited')
                ),
            })
        })

        await dialog.getByRole('textbox', { name: 'Ваш вопрос' }).fill('ещё один вопрос')
        await dialog.getByRole('button', { name: 'Отправить' }).click()

        // Скоуп внутри диалога: у страницы уже есть свой `role="alert"`
        // (announcer роутера Next), и без скоупа локатор был бы неоднозначным.
        const alert = dialog.getByRole('alert')
        await expect(alert).toBeVisible()
        // Конкретная причина — не общее «Слишком много запросов. Подождите
        // немного» (apiErrors.ts, messageFor для 429 без известного кода):
        // widgetErrorMessage (support/api/widget.ts) намеренно предпочитает
        // фразу сервера общему словарю ровно для этого случая.
        await expect(alert).toContainText('В этом чате слишком много сообщений — позовите человека')
        await expect(alert).not.toContainText('Слишком много запросов')
    })

    test('при недоступном API виджет объясняет причину и не роняет страницу', async ({ page }) => {
        await page.goto('/')

        // Разрыв соединения — не обработанный сервером отказ: посетитель без
        // сети или с упавшим бэкендом получает ровно это на первом же запросе.
        await page.route('**/api/v1/public/support/web', (route) => route.abort('failed'))

        await page.getByRole('button', { name: 'Задать вопрос' }).click()

        const dialog = page.getByRole('dialog', { name: 'Вопрос без регистрации' })
        await expect(dialog.getByRole('alert')).toContainText(/нет связи с сервером/i)

        // Страница вокруг виджета — не белый экран: шапка и главный заголовок
        // посадочной по-прежнему на месте. Виджет несёт собственный `<header>`
        // (роль banner ему не запрещена внутри `role="dialog"`), поэтому шапка
        // сайта берётся по тексту логотипа, а не первой попавшейся.
        await expect(page.getByRole('banner').filter({ hasText: 'BURCEV' })).toBeVisible()
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    })
})
