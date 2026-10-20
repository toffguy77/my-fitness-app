import { test, expect } from '../fixtures/session'
import type { BrowserContext, Page } from '@playwright/test'

/**
 * Регистрация через Яндекс — с согласиями, до создания аккаунта.
 *
 * Колбэк провайдера создавал аккаунт сразу, без согласий, без которых форма
 * регистрации не пускает дальше, — среди них согласие на обработку данных о
 * здоровье. Теперь новый адрес уводит на /auth/consents, и аккаунт появляется
 * только после «Продолжить» с обязательными галочками.
 *
 * Яндекс ID в прогоне — заглушка `scripts/oauth-stub.mjs`
 * (OAUTH_YANDEX_BASE_URL). Адрес, под которым «Яндекс» вернёт человека,
 * тест выбирает сам: добавляет `login_hint` к адресу авторизации, на который
 * API отправил браузер. Заглушка ничего не хранит, поэтому параллельные
 * проверки не получают чужих адресов.
 *
 * Вход возвращается через прокси (OAUTH_APP_ORIGIN), а не на Next: перезапись
 * Next теряет Set-Cookie, а без cookie потока вход не завершить.
 */

test.use({ role: undefined })

function freshAddress(): string {
    return `e2e-oauth-${Date.now()}-${Math.floor(Math.random() * 100000)}@burcev.test`
}

/**
 * Начинает вход через Яндекс так же, как кнопка на экране входа, и доводит
 * браузер до возврата из «Яндекса» под выбранным адресом.
 *
 * Старт — запросом через контекст: cookie потока (состояние, проверочный код)
 * ложатся в общую с браузером банку, а адрес перенаправления можно прочитать
 * и дописать к нему `login_hint`.
 */
async function signInWithYandex(page: Page, context: BrowserContext, baseURL: string, email: string) {
    const start = await context.request.get(`${baseURL}/api/v1/auth/oauth/yandex`, { maxRedirects: 0 })
    expect(start.status(), `старт входа через Яндекс: ${await start.text()}`).toBe(302)
    const authorize = new URL(start.headers()['location'])
    expect(authorize.pathname, `вход ушёл не на заглушку: ${authorize}`).toBe('/authorize')
    authorize.searchParams.set('login_hint', email)
    await page.goto(authorize.toString())
}

async function tickMandatoryConsents(page: Page, { withDataProcessing = true } = {}) {
    await page.getByRole('checkbox', { name: /Договор публичной оферты/ }).check()
    await page.getByRole('checkbox', { name: /Политику конфиденциальности/ }).check()
    if (withDataProcessing) {
        await page.getByRole('checkbox', { name: /обработку персональных данных/ }).check()
    }
}

test.describe('Регистрация через Яндекс', () => {
    test('кнопка Яндекса на экране входа ведёт на старт входа', async ({ page }) => {
        await page.goto('/auth')
        const button = page.locator('a[href="/api/v1/auth/oauth/yandex"]')
        await expect(button).toBeVisible({ timeout: 15000 })
    })

    test('новый адрес: согласия, затем аккаунт и вход в приложение', async ({ page, context, baseURL }) => {
        const email = freshAddress()
        await signInWithYandex(page, context, baseURL!, email)

        // Аккаунта ещё нет — экран согласий.
        await expect(page).toHaveURL(/\/auth\/consents\?provider=yandex/, { timeout: 15000 })
        const proceed = page.getByRole('button', { name: 'Продолжить' })
        await expect(proceed).toBeDisabled()

        await tickMandatoryConsents(page)
        await expect(proceed).toBeEnabled()

        const completed = page.waitForResponse(
            (response) => response.url().includes('/api/v1/auth/oauth/consents') && response.request().method() === 'POST',
        )
        await proceed.click()
        const answer = await completed
        expect(answer.status(), await answer.text()).toBe(200)

        // В приложении — у нового человека это онбординг (или дашборд).
        await expect(page).toHaveURL(/\/(onboarding|dashboard)/, { timeout: 15000 })

        // Сессия настоящая: переживает перезагрузку, то есть refresh-cookie
        // дошла до браузера, а не только токен в памяти вкладки.
        // Без сессии защищённая страница увела бы на /auth.
        await page.reload()
        await expect(page).toHaveURL(/\/(onboarding|dashboard)/, { timeout: 15000 })
        await page.waitForTimeout(1000)
        await expect(page).not.toHaveURL(/\/auth/)
    })

    test('повторный вход того же человека — без экрана согласий', async ({ browser, page, context, baseURL }) => {
        const email = freshAddress()

        // Первый раз — регистрация с согласиями.
        await signInWithYandex(page, context, baseURL!, email)
        await expect(page).toHaveURL(/\/auth\/consents/, { timeout: 15000 })
        await tickMandatoryConsents(page)
        await page.getByRole('button', { name: 'Продолжить' }).click()
        await expect(page).toHaveURL(/\/(onboarding|dashboard)/, { timeout: 15000 })

        // Второй раз, с чистого браузера: аккаунт уже есть и согласия даны.
        const again = await browser.newContext()
        try {
            const secondPage = await again.newPage()
            await signInWithYandex(secondPage, again, baseURL!, email)
            await expect(secondPage).not.toHaveURL(/\/auth\/consents/, { timeout: 5000 })
            await expect(secondPage).toHaveURL(/\/(onboarding|dashboard)/, { timeout: 15000 })
        } finally {
            await again.close()
        }
    })

    test('без согласия на обработку данных «Продолжить» недоступна', async ({ page, context, baseURL }) => {
        await signInWithYandex(page, context, baseURL!, freshAddress())
        await expect(page).toHaveURL(/\/auth\/consents/, { timeout: 15000 })

        await tickMandatoryConsents(page, { withDataProcessing: false })
        // Оферта и политика отмечены, маркетинг — тоже: всё равно нельзя.
        await page.getByRole('checkbox', { name: /маркетинговые материалы/ }).check()
        await expect(page.getByRole('button', { name: 'Продолжить' })).toBeDisabled()

        // И сервер держит то же правило, а не только кнопка.
        const refused = await context.request.post(`${baseURL}/api/v1/auth/oauth/consents`, {
            data: {
                consents: {
                    terms_of_service: true,
                    privacy_policy: true,
                    data_processing: false,
                    marketing: true,
                },
            },
        })
        expect(refused.status()).toBe(400)
        expect((await refused.json()).code).toBe('validation')
    })
})
