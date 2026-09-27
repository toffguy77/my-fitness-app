import { test, expect } from '../fixtures/session'
import { freshAddress } from '../fixtures/mail'
import { FoodTrackerPage } from '../pages/food-tracker.page'

/**
 * Клиент больше не отправляет серверные факты, а негодное событие не уносит
 * пакет.
 *
 * `first_food_entry` прожил всю жизнь мёртвым: клиент отправлял его со
 * свойством `meal_type`, которого для этого имени не объявляли, сервер отвергал
 * событие — и вместе с ним весь пакет, то есть и первый `food_entry_created`
 * того же человека. То же случилось с `lead_saved`: свойство `capture_source`
 * добавили в таблицу, в службу и в клиентский вызов, но не в словарь, и воронка
 * заявок не записала ни одной из двух настоящих заявок.
 *
 * Здесь проверяется то, что видно только через браузер: какой пакет он в
 * действительности посылает и что ему отвечают.
 */

test.use({ role: undefined })

const PASSWORD = 'E2eStand!2026'

test.describe('серверные факты и частичный приём', () => {
    test('дневник питания не отправляет первую запись, но отправляет саму запись', async ({
        page,
        context,
        baseURL,
    }) => {
        const registered = await context.request.post(`${baseURL}/api/v1/auth/register`, {
            data: {
                email: freshAddress(),
                password: PASSWORD,
                name: 'Проверка Событий',
                consents: {
                    terms_of_service: true,
                    privacy_policy: true,
                    data_processing: true,
                    marketing: false,
                },
            },
        })
        expect(registered.status(), await registered.text()).toBe(201)

        // Клиент сначала пробует sendBeacon, а его браузерная автоматика не
        // показывает. В самом клиенте есть ветка отката на fetch — ею и
        // пользуемся: отправляемый состав событий у обоих способов один и тот
        // же, а fetch видно.
        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'sendBeacon', {
                configurable: true,
                value: () => false,
            })
        })

        const sent: string[] = []
        page.on('request', (request) => {
            if (!request.url().includes('/analytics/events')) return
            const body = request.postDataJSON() as { events?: Array<{ name: string }> } | null
            for (const event of body?.events ?? []) sent.push(event.name)
        })

        // Через страничный объект: его селекторы уже проверены остальным набором.
        const foodTracker = new FoodTrackerPage(page)
        await foodTracker.goto()
        await foodTracker.expectLoaded()
        await foodTracker.openAddFoodForMeal('Завтрак')
        await foodTracker.searchFood('Яблоко')
        await foodTracker.selectFirstResult()
        await foodTracker.submitFoodEntry()

        // Пакет уходит по расписанию или при уходе со страницы — уход надёжнее.
        await page.goto('/dashboard')
        await expect(page.getByText('Первая неделя')).toBeVisible({ timeout: 20000 })
        await expect
            .poll(() => sent.length, { timeout: 15000 })
            .toBeGreaterThan(0)

        expect(sent, 'запись о еде — клиентское событие и остаётся им').toContain(
            'food_entry_created',
        )
        expect(sent, 'первая запись о еде теперь серверный факт').not.toContain(
            'first_food_entry',
        )
    })

    // Ответ на пакет обязан называть оба числа: прежний ответ сообщал размер
    // присланного и был одинаков что при полном приёме, что при половинном.
    test('ответ на пакет называет принятые и отклонённые', async ({ context, baseURL }) => {
        const answer = await context.request.post(
            `${baseURL}/api/v1/public/analytics/events`,
            {
                data: {
                    visitor_id: '3f0c2b7e-6b1a-4e4e-9a4d-2f5a5f0c1b22',
                    platform: 'web',
                    events: [
                        { name: 'landing_viewed', occurred_at: new Date().toISOString() },
                        // Негодное: свойство объявлено для соседнего события.
                        {
                            name: 'landing_viewed',
                            occurred_at: new Date().toISOString(),
                            properties: { meal_type: 'breakfast' },
                        },
                        {
                            name: 'support_chat_opened',
                            occurred_at: new Date().toISOString(),
                            properties: { from: 'no_lead' },
                        },
                    ],
                },
            },
        )

        expect(answer.status(), await answer.text()).toBe(202)
        const data = (await answer.json()).data
        expect(data).toEqual({ recorded: 2, refused: 1 })
    })

    // Та самая пара, что погибала целиком: заявка с точкой захвата и захват
    // контакта, отправляемые рядом.
    test('заявка с точкой захвата принимается вместе с захватом контакта', async ({
        context,
        baseURL,
    }) => {
        const answer = await context.request.post(
            `${baseURL}/api/v1/public/analytics/events`,
            {
                data: {
                    visitor_id: '5a1c2b7e-6b1a-4e4e-9a4d-2f5a5f0c1b33',
                    platform: 'web',
                    events: [
                        {
                            name: 'lead_saved',
                            occurred_at: new Date().toISOString(),
                            properties: { contact_consent: true, capture_source: 'result' },
                        },
                        {
                            name: 'contact_captured',
                            occurred_at: new Date().toISOString(),
                            properties: { source: 'result' },
                        },
                    ],
                },
            },
        )

        expect(answer.status(), await answer.text()).toBe(202)
        expect((await answer.json()).data).toEqual({ recorded: 2, refused: 0 })
    })

    // Серверный факт из браузера отклоняется — иначе переход дал бы двойной
    // счёт: старая вкладка присылает его, и рядом его же пишет сервер.
    test('серверный факт из браузера отклоняется, соседи выживают', async ({
        context,
        baseURL,
    }) => {
        const answer = await context.request.post(
            `${baseURL}/api/v1/public/analytics/events`,
            {
                data: {
                    visitor_id: '7b2c2b7e-6b1a-4e4e-9a4d-2f5a5f0c1b44',
                    platform: 'web',
                    events: [
                        { name: 'landing_viewed', occurred_at: new Date().toISOString() },
                        { name: 'first_food_entry', occurred_at: new Date().toISOString() },
                        { name: 'first_curator_message', occurred_at: new Date().toISOString() },
                    ],
                },
            },
        )

        expect(answer.status(), await answer.text()).toBe(202)
        expect((await answer.json()).data).toEqual({ recorded: 1, refused: 2 })
    })
})
