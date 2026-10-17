import { test, expect, signIn, asUser } from '../fixtures/session'
import { DashboardPage } from '../pages/dashboard.page'

/**
 * Отзыв куратора на недельный отчёт — от отправки до того, что видит клиент.
 *
 * Уведомление «Обратная связь от куратора» вело на
 * `/dashboard/weekly-reports/<id>/feedback` — страницы, которой нет: клиент
 * нажимал и получал 404, а отзыв было не прочитать нигде. Теперь ссылка ведёт
 * на `/dashboard?report=<id>`, и дашборд показывает блок «Отзыв куратора».
 *
 * Отчёт заводит сеятель (`cmd/seed-e2e`, неделя 2026-01-05): отправить его
 * через API в прогоне нельзя — отчёт требует недельного фото, а хранилища для
 * фото в прогоне нет. Всё остальное — отзыв, уведомление, переход — идёт
 * настоящим путём.
 */

// Две роли в одном файле: сессия проекта была бы не тем человеком.
test.use({ role: undefined })

const SEEDED_WEEK_START = '2026-01-05'

test('клиент открывает отзыв куратора из уведомления', async ({ browser, page, context, baseURL }) => {
    // Клиент: его id нужен куратору, и под ним же откроется дашборд.
    const clientToken = await signIn(context, baseURL!, 'client')
    const profile = await context.request.get(`${baseURL}/api/v1/users/profile`, {
        headers: asUser(clientToken),
    })
    expect(profile.ok(), await profile.text()).toBeTruthy()
    const clientId: number = (await profile.json()).data.profile.id

    // Куратор находит засеянный отчёт и оставляет на него отзыв.
    const summary = `Неделя ровная, белка хватает — e2e ${Date.now()}`
    const curatorContext = await browser.newContext()
    let reportId: string
    try {
        const curatorToken = await signIn(curatorContext, baseURL!, 'curator')
        const reports = await curatorContext.request.get(
            `${baseURL}/api/v1/curator/clients/${clientId}/weekly-reports`,
            { headers: asUser(curatorToken) },
        )
        expect(reports.ok(), await reports.text()).toBeTruthy()
        const list = ((await reports.json()).data ?? []) as { id: string; week_start: string }[]
        const seeded = list.find((report) => report.week_start === SEEDED_WEEK_START)
        expect(seeded, `нет засеянного отчёта за ${SEEDED_WEEK_START} — запущен ли cmd/seed-e2e?`).toBeTruthy()
        reportId = seeded!.id

        const submitted = await curatorContext.request.put(
            `${baseURL}/api/v1/curator/clients/${clientId}/weekly-reports/${reportId}/feedback`,
            {
                headers: asUser(curatorToken),
                data: {
                    nutrition: { rating: 'good', comment: 'Белок в норме' },
                    activity: { rating: 'needs_improvement', comment: 'Добавить прогулку' },
                    water: { rating: 'excellent', comment: '' },
                    summary,
                    recommendations: 'Ещё одна тренировка на неделе',
                },
            },
        )
        expect(submitted.ok(), await submitted.text()).toBeTruthy()
    } finally {
        await curatorContext.close()
    }

    // Уведомление ведёт на существующую страницу.
    const notifications = await context.request.get(`${baseURL}/api/v1/notifications?category=main&limit=50`, {
        headers: asUser(clientToken),
    })
    expect(notifications.ok(), await notifications.text()).toBeTruthy()
    const items = ((await notifications.json()).data?.notifications ?? []) as {
        type: string
        actionUrl?: string
    }[]
    const feedbackNotice = items.find((item) => item.actionUrl === `/dashboard?report=${reportId}`)
    expect(
        feedbackNotice,
        `нет уведомления со ссылкой /dashboard?report=${reportId}; есть: ${JSON.stringify(items.map((i) => i.actionUrl))}`,
    ).toBeTruthy()

    // Клиент нажимает уведомление — и читает отзыв.
    await page.goto('/notifications')
    await page.getByRole('button', { name: /^Обратная связь от куратора\./ }).first().click()
    await expect(page).toHaveURL(new RegExp(`/dashboard\\?report=${reportId}`), { timeout: 15000 })

    // Блок открыт сразу: человек пришёл сюда его прочитать.
    const block = page.getByRole('region', { name: 'Отзыв куратора' })
    await expect(block).toBeVisible({ timeout: 15000 })
    await expect(block.getByText(summary)).toBeVisible()
    await expect(block.getByText('Ещё одна тренировка на неделе')).toBeVisible()
    await expect(block.getByRole('list', { name: 'Оценки по категориям' }).getByRole('listitem')).toHaveCount(3)
})

test('без ?report= дашборд не показывает и не запрашивает отзыв', async ({ page, context, baseURL }) => {
    await signIn(context, baseURL!, 'client')

    const feedbackRequests: string[] = []
    page.on('request', (request) => {
        if (/\/weekly-reports\/[^/]+\/feedback/.test(request.url())) feedbackRequests.push(request.url())
    })

    await page.goto('/dashboard')
    await new DashboardPage(page).expectLoaded()
    // Запрос ушёл бы вместе с первой отрисовкой; небольшой запас на неё.
    await page.waitForTimeout(1500)

    await expect(page.getByRole('region', { name: 'Отзыв куратора' })).toHaveCount(0)
    expect(feedbackRequests, 'без параметра отзыв запрашиваться не должен').toEqual([])
})
