import { test, expect, signIn } from '../fixtures/session'

/**
 * Where notifications go, and how somebody changes that.
 *
 * The parts a person can only check by hand — a browser actually accepting a
 * push, a service worker actually showing one — are checked here instead. What
 * is deliberately not checked: delivery through Google's or Mozilla's push
 * service. That is their infrastructure; a test on it would report on the
 * runner's connectivity, not on this application.
 */

/**
 * Stands in for the browser's permission prompt.
 *
 * The headless browser CI runs refuses notifications outright, which is not a
 * state a person is ever in — it has no prompt to show. What this file is for
 * is our flow: that permission is asked at the moment somebody presses the
 * button and never before, and that the answer is acted on. The prompt itself
 * belongs to the browser.
 */
const stubPermissionPrompt = `
    let state = 'default'
    Object.defineProperty(window, 'Notification', {
        configurable: true,
        value: {
            get permission() { return state },
            requestPermission: async () => {
                window.__permissionAsked?.()
                state = 'granted'
                return state
            },
        },
    })
`

/**
 * Stands in for the browser's push service.
 *
 * `pushManager.subscribe` talks to Google, which a CI runner cannot reach and
 * should not need to. What matters here is our half: that pressing the button
 * produces a subscription and hands it to the API in the shape the server
 * stores. The endpoint has to look like a real one — the server refuses
 * anything that is not https on a standard port, and that refusal is worth
 * exercising too.
 */
const stubPushService = `
    const encoder = new TextEncoder()
    const fakeKey = (seed) => encoder.encode(seed.repeat(8)).buffer
    Object.defineProperty(PushManager.prototype, 'subscribe', {
        value: async () => ({
            endpoint: 'https://fcm.googleapis.com/fcm/send/e2e-' + Date.now(),
            getKey: (name) => fakeKey(name === 'auth' ? 'a' : 'p'),
            unsubscribe: async () => true,
        }),
        configurable: true,
    })
`

// One account, one preferences object, and every save sends the whole of it.
// In parallel these tests overwrite each other's changes with their own stale
// copy — which looks exactly like the server failing to store anything.
test.describe.configure({ mode: 'serial' })

test.describe('Delivery settings', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/settings/notifications')
        await expect(page.getByTestId('delivery-settings')).toBeVisible({ timeout: 15000 })
    })

    test('the application column is shown and cannot be moved', async ({ page }) => {
        // The notification list is the record of what happened, not a way of
        // interrupting anybody. A switch that could empty it would leave
        // events with nowhere to go.
        const inApp = page.getByRole('switch', { name: /в приложении$/ }).first()

        await expect(inApp).toBeChecked()
        await expect(inApp).toBeDisabled()
    })

    test('turning an email off survives a reload', async ({ page }) => {
        const emailSwitch = page.getByRole('switch', { name: /письмом$/ }).first()
        const before = await emailSwitch.getAttribute('aria-checked')

        await emailSwitch.click()
        await expect(emailSwitch).toHaveAttribute('aria-checked', before === 'true' ? 'false' : 'true')

        await page.reload()
        await expect(page.getByTestId('delivery-settings')).toBeVisible({ timeout: 15000 })

        const after = page.getByRole('switch', { name: /письмом$/ }).first()
        await expect(after).toHaveAttribute('aria-checked', before === 'true' ? 'false' : 'true')

        // Put it back, so the next test starts where the seed left it.
        await after.click()
        await expect(after).toHaveAttribute('aria-checked', before ?? 'true')
    })

    test('quiet hours are stored with both ends, never one', async ({ page }) => {
        const stored = page.waitForResponse(
            (response) =>
                response.url().includes('/delivery-preferences') &&
                response.request().method() === 'PUT'
        )
        await page.getByLabel('Начало тихого времени').selectOption('23')
        await page.getByLabel('Конец тихого времени').selectOption('7')
        await stored

        await page.reload()
        await expect(page.getByTestId('delivery-settings')).toBeVisible({ timeout: 15000 })

        await expect(page.getByLabel('Начало тихого времени')).toHaveValue('23')
        await expect(page.getByLabel('Конец тихого времени')).toHaveValue('7')

        const cleared = page.waitForResponse(
            (response) =>
                response.url().includes('/delivery-preferences') &&
                response.request().method() === 'PUT' &&
                (response.request().postData() ?? '').includes('"quietHoursStart":null')
        )
        // Scoped to the quiet-hours block: the push section has a button of
        // the same name for turning push off.
        const quietHours = page.getByTestId('delivery-settings').locator('div', {
            hasText: 'Тихое время',
        })
        await quietHours.getByText('Выключить').first().click()
        await cleared

        await page.reload()
        await expect(page.getByTestId('delivery-settings')).toBeVisible({ timeout: 15000 })
        // Off means off: the defaults are shown, not a stored interval.
        await expect(page.getByLabel('Начало тихого времени')).toHaveValue('22')
        await expect(page.getByLabel('Конец тихого времени')).toHaveValue('8')
    })

    test('unsubscribing from email closes the whole column', async ({ page }) => {
        const master = page.getByRole('switch', { name: 'Получать письма' })
        await master.click()

        const anyEmailSwitch = page.getByRole('switch', { name: /письмом$/ }).first()
        await expect(anyEmailSwitch).toBeDisabled()
        await expect(anyEmailSwitch).not.toBeChecked()

        await master.click()
        await expect(anyEmailSwitch).toBeEnabled()
    })
})

test.describe('Push', () => {
    test('is offered with an explanation, and asks nothing before it is pressed', async ({
        page,
    }) => {
        // A prompt shown before somebody knows what the product does is the
        // fastest route to a permanent "no": the browser remembers a refusal.
        let asked = false
        await page.exposeFunction('__permissionAsked', () => {
            asked = true
        })
        await page.addInitScript(stubPermissionPrompt)
        await page.addInitScript(stubPushService)

        await page.goto('/settings/notifications')
        await expect(page.getByTestId('push-section')).toBeVisible({ timeout: 15000 })
        await expect(page.getByText(/Push приходит сразу/)).toBeVisible()
        await page.waitForTimeout(1000)

        expect(asked, 'the browser was asked before anybody pressed anything').toBe(false)

        await page.getByRole('button', { name: 'Включить push' }).click()

        await expect(page.getByText(/Push включён на этом устройстве/)).toBeVisible({
            timeout: 15000,
        })
    })

    test('a subscription reaches the server and can be withdrawn', async ({ page }) => {
        await page.addInitScript(stubPermissionPrompt)
        await page.addInitScript(stubPushService)

        await page.goto('/settings/notifications')
        const section = page.getByTestId('push-section')
        await expect(section).toBeVisible({ timeout: 15000 })

        // The previous test may have left this browser subscribed.
        if (await section.getByRole('button', { name: 'Выключить' }).count()) {
            await section.getByRole('button', { name: 'Выключить' }).click()
            await expect(page.getByRole('button', { name: 'Включить push' })).toBeVisible()
        }

        // What matters is the outcome, not which response carried it: the
        // subscription is accepted by the server and the section says so.
        const answers: number[] = []
        page.on('response', (response) => {
            if (response.url().endsWith('/api/v1/notifications/push')) {
                answers.push(response.status())
            }
        })

        await page.getByRole('button', { name: 'Включить push' }).click()
        await expect(page.getByText(/Push включён на этом устройстве/)).toBeVisible({
            timeout: 15000,
        })

        await section.getByRole('button', { name: 'Выключить' }).click()
        await expect(page.getByRole('button', { name: 'Включить push' })).toBeVisible({
            timeout: 15000,
        })

        expect(answers.length, 'the server was never told about the subscription').toBeGreaterThan(0)
        expect(answers.every((status) => status === 200), `the server answered ${answers}`).toBe(true)
    })

    test('an iPhone is told to install the app rather than shown a button that cannot work', async ({
        browser,
        baseURL,
    }) => {
        // On iOS push reaches only an app added to the home screen. Asking in
        // Safari would fail with no explanation, so the platform is detected
        // and the person is told what to do instead. The install itself needs
        // a real device and is not checked here.
        const context = await browser.newContext({
            userAgent:
                'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 ' +
                '(KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
        })

        try {
            await signIn(context, baseURL!, 'client')
            const page = await context.newPage()
            // An iOS browser outside an installed app has no push at all.
            await page.addInitScript('delete window.PushManager')

            await page.goto('/settings/notifications')
            await expect(page.getByTestId('push-section')).toBeVisible({ timeout: 15000 })

            await expect(page.getByText(/на домашний экран/)).toBeVisible()
            await expect(page.getByRole('button', { name: 'Включить push' })).toHaveCount(0)
        } finally {
            await context.close()
        }
    })
})
