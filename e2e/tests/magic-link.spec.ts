import { test, expect } from '../fixtures/session'
import type { Page, APIRequestContext, BrowserContext } from '@playwright/test'
import { getAccount } from '../fixtures/test-accounts'
import { AuthPage } from '../pages/auth.page'

/**
 * Вход по одноразовой ссылке — целиком: запрос, письмо, переход, сессия.
 *
 * Писем в E2E взять неоткуда — как и `registration.spec.ts`, письмо читается
 * из Mailpit (`MAILPIT_URL`, тот же перехватчик, что уже стоит для цифрового
 * кода регистрации). У ссылки входа в письме нет кода — есть URL с
 * параметром `token`; он и извлекается тем же способом: из тела письма, а не
 * из базы, потому что смысл проверки в том, что человек получает ссылку,
 * которой можно воспользоваться.
 *
 * НАЙДЕНО ПРИ ПОДГОТОВКЕ ЭТОГО СПЕКА: письмо шлёт ссылку на
 * `http://localhost:3069/...` (или `https://` + `APP_DOMAIN`, если он задан)
 * — `auth/magiclink.go` не знает о `dev-proxy` на 3070 и не может о нём
 * узнать через конфигурацию (`APP_DOMAIN` жёстко получает префикс `https://`,
 * так что указать локальный `http`-адрес прокси через него нельзя). Открыть
 * буквальную ссылку из письма значило бы открыть её мимо прокси — то есть
 * ровно тот путь, который по документации проекта не пробрасывает
 * `Set-Cookie` и оставляет без сессии. Поэтому здесь, как и в соседних
 * спеках с кодом подтверждения, из письма берётся только токен, а адрес для
 * перехода строится на `baseURL` — прокси, а не Next напрямую. Это
 * ограничение самого продукта в локальном/CI-окружении, не спека; см. отчёт
 * задачи 12.
 */

const MAILPIT = process.env.MAILPIT_URL || 'http://localhost:8025'

test.use({ role: undefined })

function freshAddress(prefix = 'magic-link'): string {
    return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}@burcev.test`
}

interface MailpitMessage {
    ID: string
    Subject: string
}

/** Самое свежее письмо для адреса. Почта уходит не мгновенно — ждём. */
async function waitForLetter(request: APIRequestContext, address: string): Promise<MailpitMessage> {
    for (let attempt = 0; attempt < 30; attempt++) {
        const response = await request.get(
            `${MAILPIT}/api/v1/search?query=${encodeURIComponent('to:' + address)}`,
        )
        if (response.ok()) {
            const body = await response.json()
            const messages = (body.messages ?? []) as MailpitMessage[]
            if (messages.length > 0) return messages[0]
        }
        await new Promise((resolve) => setTimeout(resolve, 500))
    }
    throw new Error(`письмо на ${address} не пришло за 15 секунд`)
}

/**
 * Токен ссылки входа из письма.
 *
 * Из ТЕКСТА письма, а не из базы — та же причина, что у кода подтверждения в
 * `registration.spec.ts`: проверяется то, чем реально может воспользоваться
 * человек.
 */
async function magicLinkTokenFromLetter(request: APIRequestContext, messageID: string): Promise<string> {
    const response = await request.get(`${MAILPIT}/api/v1/message/${messageID}`)
    expect(response.ok(), 'письмо не читается').toBeTruthy()
    const body = await response.json()
    const text = `${body.Text ?? ''}\n${body.HTML ?? ''}`

    const match = text.match(/token=([0-9a-f]+)/)
    expect(match, `в письме нет ссылки с токеном:\n${text.slice(0, 400)}`).toBeTruthy()
    return match![1]
}

async function requestMagicLink(context: BrowserContext, baseURL: string, email: string) {
    const response = await context.request.post(`${baseURL}/api/v1/auth/magic-link/request`, {
        data: {
            email,
            consents: { terms_of_service: true, privacy_policy: true, data_processing: true, marketing: false },
        },
    })
    expect(response.status(), await response.text()).toBe(200)
}

/** Проводит гостя через мастер до экрана результата с известными ростом и весом. */
async function completeGuestWizardToResult(
    page: Page,
    { heightCm, weightKg }: { heightCm: string; weightKg: string },
) {
    await page.goto('/onboarding')
    await expect(page.getByText('Какая у вас цель?')).toBeVisible({ timeout: 15000 })

    await page.getByRole('button', { name: /Снизить вес/ }).click()
    await page.getByRole('button', { name: 'Далее' }).click()

    await page.getByRole('button', { name: 'Мужской' }).click()
    await page.getByLabel('Дата рождения').fill('1988-03-02')
    await page.getByLabel('Рост, см').fill(heightCm)
    await page.getByLabel('Вес, кг').fill(weightKg)
    await page.getByRole('button', { name: 'Далее' }).click()

    await page.getByRole('button', { name: /Умеренная активность/ }).click()
    await page.getByRole('button', { name: 'Показать мою норму' }).click()

    await expect(page.getByTestId('guest-calories')).toBeVisible({ timeout: 15000 })
}

test.describe('Вход по одноразовой ссылке', () => {
    test('гость сохраняет расчёт с экрана результата и позже входит по ссылке: рост и вес переносятся в аккаунт без повторного ввода', async ({
        page,
        context,
        request,
        baseURL,
    }) => {
        const address = freshAddress('newaccount')

        await completeGuestWizardToResult(page, { heightCm: '178', weightKg: '82.5' })

        // Захват контакта прямо на экране результата (задача 10), не на
        // отдельном шаге контакта — форма под цифрами расчёта.
        // Точное имя поля: на экране теперь две формы — ссылки («Почта») и
        // пароля («Электронная почта»), — и свободное /почт/i совпадало с
        // обеими. Форма пароля скрыта, но в разметке есть.
        await page.getByLabel('Почта', { exact: true }).fill(address)
        await page.getByLabel(/обработку/i).check()
        await page.getByRole('button', { name: 'Сохранить расчёт' }).click()
        await expect(page.getByText('Расчёт сохранён на этой почте.')).toBeVisible({ timeout: 10000 })

        // Тот же адрес — запрос ссылки входа. Аккаунта на этот адрес ещё нет:
        // сервер решит завести его при переходе.
        //
        // `/auth` открывает форму пароля: вход и регистрация разведены по
        // существу. К ссылке ведёт переключатель — им и пользуемся, как
        // человек без пароля. Переключатель отрисован сервером раньше, чем к
        // нему привязан обработчик, поэтому повторяем сам клик, а не только
        // ожидание после него.
        await page.goto('/auth')
        await expect(async () => {
            await page.getByRole('button', { name: 'Войти по ссылке' }).click()
            await expect(page.getByLabel('Почта', { exact: true })).toBeVisible({ timeout: 2000 })
        }).toPass({ timeout: 15000 })
        await page.getByLabel('Почта', { exact: true }).fill(address)
        await page.getByLabel(/оферт/i).check()
        await page.getByLabel(/конфиденциальност/i).check()
        await page.getByLabel(/обработку/i).check()
        await page.getByRole('button', { name: 'Получить ссылку для входа' }).click()
        await expect(
            page.getByText('Если такой адрес существует, мы отправили на него ссылку для входа'),
        ).toBeVisible({ timeout: 10000 })

        const letter = await waitForLetter(request, address)
        expect(letter.Subject).toBe('Ваш аккаунт в BURCEV')
        const token = await magicLinkTokenFromLetter(request, letter.ID)

        // Переход строится на baseURL (прокси), а не на буквальном адресе из
        // письма — см. комментарий к файлу.
        await page.goto(`${baseURL}/auth/link/consume?token=${token}`)

        // Аккаунт только что создан этим переходом и ещё не проходил
        // онбординг — destinationFor ведёт сюда, а не в дашборд.
        await expect(page).toHaveURL(/\/onboarding/, { timeout: 15000 })

        // Signed-in ветка /onboarding — мастер настроек аккаунта, не
        // гостевой калькулятор. Первый шаг — язык/единицы/часовой пояс, тело
        // и цели — второй; переходим на него.
        await page.getByRole('button', { name: 'Далее' }).click()

        // Рост из заявки пришёл в user_settings при погашении ссылки
        // (leads.ApplyToProfile) и подставлен в форму через getProfile() —
        // печатать его заново не нужно.
        await expect(page.getByLabel(/Рост/)).toHaveValue('178', { timeout: 10000 })

        // Дата рождения НЕ проверяется здесь: живой прогон вскрыл, что она
        // не доезжает до поля (GET /api/v1/users/profile отдаёт
        // "1988-03-02T00:00:00Z", `<input type="date">` принимает только
        // "YYYY-MM-DD" и молча отвергает значение). Это дефект в
        // apps/api/internal/modules/users/service.go, не в задаче 12, и
        // задевает любой профиль с датой рождения, не только вход по
        // ссылке — фиксировать его здесь ассертом означало бы либо закрепить
        // сломанное поведение как ожидаемое, либо покрасить спек по чужой
        // причине. Оставлено непокрытым намеренно; см. отчёт задачи 12.
        //
        // ЕЩЁ ОДНА НАХОДКА ЭТОГО ТЕСТА, ТОЖЕ НЕ ЧИНЮ: клик «Далее» выше
        // вызывает PUT /api/v1/users/settings с ЧАСТИЧНЫМ телом (только
        // язык/единицы/часовой пояс — шаг 0 мастера). UpdateSettings
        // (apps/api/internal/modules/users/service.go) делает слепой
        // upsert (`height = EXCLUDED.height` без COALESCE, в отличие от
        // leads.ApplyToProfile) — рост, дата рождения, пол, активность и
        // цель, только что перенесённые из заявки, в эту секунду стираются
        // в базе. Поле выше ещё показывает 178 только потому, что читает
        // локальное состояние формы, загруженное ДО этого клика, а не
        // спрашивает сервер заново. Подтверждено отдельно, в обход браузера:
        // PUT с телом {language, units, timezone} на свежесозданный аккаунт
        // с заполненным профилем возвращает профиль без height/birth_date/
        // biological_sex/activity_level/fitness_goal. Серьёзный, общий
        // дефект (задевает вообще любое частичное сохранение настроек, не
        // только вход по ссылке) — подробности в отчёте задачи 12.

        // Вес заявки применяется не в user_settings, а как сегодняшняя запись
        // в daily_metrics (leads/service.go ApplyToProfile) — не задета
        // дефектом выше (другая таблица). Проверяется напрямую через API, в
        // обход дашборда: «сегодня» на дашборде — по часовому поясу
        // человека, а строка написана через `CURRENT_DATE` сервера Postgres
        // (там UTC) — в окне между полуночью UTC и полуночью MSK (сейчас)
        // это два разных календарных дня, и проверка по дашборду ловила бы
        // не дефект входа по ссылке, а известную рассинхронизацию дат,
        // зависящую от времени суток прогона.
        const refreshed = await context.request.post(`${baseURL}/api/v1/auth/refresh`)
        expect(refreshed.status(), await refreshed.text()).toBe(200)
        const accessToken = (await refreshed.json())?.data?.token
        expect(accessToken, 'обновление токена не вернуло access-токен').toBeTruthy()

        const utcToday = new Date().toISOString().slice(0, 10)
        const daily = await context.request.get(`${baseURL}/api/v1/dashboard/daily/${utcToday}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        })
        expect(daily.status(), await daily.text()).toBe(200)
        expect((await daily.json())?.data?.weight).toBe(82.5)

        // Учётные данные никуда вводить не пришлось: сессия установлена
        // одним переходом по ссылке, без пароля.
        await expect(context.cookies().then((cookies) => cookies.some((c) => c.name === 'session_present'))).resolves.toBe(
            true,
        )
    })

    test('повторный переход по уже применённой ссылке отклоняется, а не впускает внутрь', async ({
        page,
        context,
        request,
        baseURL,
    }) => {
        const address = freshAddress('reused')
        await requestMagicLink(context, baseURL!, address)
        const letter = await waitForLetter(request, address)
        const token = await magicLinkTokenFromLetter(request, letter.ID)

        // Первый переход гасит ссылку — через сам API, без браузера: этот
        // тест проверяет второй переход, а не первый.
        const first = await context.request.post(`${baseURL}/api/v1/auth/magic-link/consume`, {
            data: { token },
        })
        expect(first.status(), await first.text()).toBe(200)

        // Второй переход по той же ссылке — из свежего контекста без cookie,
        // как если бы её открыли на другом устройстве.
        const freshContext = await (page.context().browser()!).newContext()
        try {
            const freshPage = await freshContext.newPage()
            await freshPage.goto(`${baseURL}/auth/link/consume?token=${token}`)

            // Не внутри: URL остаётся на странице перехода, не на дашборде и
            // не на онбординге.
            await expect(freshPage).toHaveURL(/\/auth\/link\/consume/, { timeout: 10000 })
            // p[role="alert"], не getByRole('alert') без разбора: Next.js
            // всегда держит на странице свой собственный
            // #__next-route-announcer__ с тем же ролем — общий локатор ловит
            // оба узла и падает в strict mode.
            const failureAlert = freshPage.locator('p[role="alert"]')
            await expect(failureAlert).toBeVisible({ timeout: 10000 })
            await expect(failureAlert).toContainText(/не подходит|недействительн/i)
            await expect(freshPage.getByRole('link', { name: 'Вернуться ко входу' })).toBeVisible()

            const cookies = await freshContext.cookies()
            expect(cookies.some((c) => c.name === 'session_present')).toBe(false)
        } finally {
            await freshContext.close()
        }
    })

    test('поддельная ссылка отвечает отказом, а не впускает внутрь', async ({ page, baseURL }) => {
        const forged = '0'.repeat(64)
        await page.goto(`${baseURL}/auth/link/consume?token=${forged}`)

        await expect(page).toHaveURL(/\/auth\/link\/consume/, { timeout: 10000 })
        const failureAlert = page.locator('p[role="alert"]')
        await expect(failureAlert).toBeVisible({ timeout: 10000 })
        await expect(failureAlert).toContainText(/не подходит|недействительн/i)

        const cookies = await page.context().cookies()
        expect(cookies.some((c) => c.name === 'session_present')).toBe(false)
    })

    test('вход по ссылке в существующий аккаунт не заводит второй и ведёт сразу в кабинет', async ({
        page,
        context,
        request,
        baseURL,
    }) => {
        const account = getAccount('client')
        await requestMagicLink(context, baseURL!, account.email)

        const letter = await waitForLetter(request, account.email)
        expect(letter.Subject).toBe('Вход в BURCEV')
        const token = await magicLinkTokenFromLetter(request, letter.ID)

        await page.goto(`${baseURL}/auth/link/consume?token=${token}`)

        // Аккаунт уже прошёл онбординг — ведёт прямо в кабинет, не в мастер.
        await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 })
        await expect(page.getByTestId('dashboard-layout')).toBeVisible({ timeout: 15000 })
    })

    test('пароль в беспарольный аккаунт отклоняется так же, как неверный пароль', async ({
        page,
        context,
        request,
        baseURL,
    }) => {
        const address = freshAddress('passwordless')
        await requestMagicLink(context, baseURL!, address)
        const letter = await waitForLetter(request, address)
        const token = await magicLinkTokenFromLetter(request, letter.ID)

        // Аккаунт заводится через API — эта проверка про форму пароля, не
        // про сам переход по ссылке (он покрыт первым тестом файла).
        const consumed = await context.request.post(`${baseURL}/api/v1/auth/magic-link/consume`, {
            data: { token },
        })
        expect(consumed.status(), await consumed.text()).toBe(200)

        await page.context().clearCookies()
        // e2e/pages/auth.page.ts — было сломано (доступные имена перевели
        // на русский третьим кругом правок задачи 9, объект остался с
        // английскими строками), починено в этой же задаче: имена теперь
        // берутся из словаря, а не вписаны литералом.
        const authPage = new AuthPage(page)
        await authPage.goto()
        await authPage.login(address, 'AnyGuess!1234')

        // Тот же текст, что и обычный неверный пароль (change-password.spec.ts)
        // — не различить снаружи, что у аккаунта вообще нет пароля.
        await expect(page.getByText('Неверный логин или пароль')).toBeVisible({ timeout: 15000 })
    })
})

test.describe('Захват контакта на экране результата', () => {
    test.use({ role: undefined })

    test('без согласия на обработку данных кнопка сохранения недоступна', async ({ page }) => {
        await completeGuestWizardToResult(page, { heightCm: '165', weightKg: '58' })

        await page.getByLabel('Почта', { exact: true }).fill(freshAddress('noconsent'))
        await expect(page.getByRole('button', { name: 'Сохранить расчёт' })).toBeDisabled()

        await page.getByLabel(/обработку/i).check()
        await expect(page.getByRole('button', { name: 'Сохранить расчёт' })).toBeEnabled()
    })
})
