import type { APIRequestContext } from '@playwright/test'

import { test, expect, signIn, asUser } from '../fixtures/session'

/**
 * Заявки с посадочной страницы, разобранные кураторами.
 *
 * До этого плана они лежали под `/admin/leads` — экран одного человека,
 * список без порядка. Здесь это очередь: только необработанные, старейшая
 * первой, с основанием для разговора и без действия «Написать» там, где
 * согласия на связь не было.
 *
 * Данные заводятся напрямую через публичный `/api/v1/public/leads` — тем же
 * путём, которым их создаёт мастер расчёта на посадочной странице — и
 * снимаются в `afterEach` через `/api/v1/public/leads/unsubscribe`, который
 * удаляет запись безусловно. Это единственный способ убрать заявку: у
 * очереди нет ни PUT, ни DELETE (задача 2.5), а отметка «обработана»
 * необратима — оставленная висеть, она отравляет очередь для всех
 * последующих прогонов и для следующего теста в этом же файле.
 *
 * Уборка вызывается и на упавшем тесте: `afterEach` в Playwright выполняется
 * независимо от исхода, а список заявок, которые нужно убрать, наполняется по
 * мере создания — не одним built-up в конце теста, который не выполнится,
 * если тест упал раньше.
 *
 * Каждая заявка помечена уникальным адресом почты (тег + время + случайный
 * хвост), чтобы тесты, идущие параллельно в разных воркерах, не путали свои
 * карточки друг с другом и с чужими заявками, уже лежащими в очереди.
 */

test.use({ role: undefined })

interface SeededLead {
    id: string
    email: string
    token: string
}

function uniqueEmail(tag: string): string {
    return `e2e-lead-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@burcev.test`
}

async function createLead(
    request: APIRequestContext,
    baseURL: string,
    opts: { tag: string; contact?: boolean }
): Promise<SeededLead> {
    const email = uniqueEmail(opts.tag)
    const response = await request.post(`${baseURL}/api/v1/public/leads`, {
        data: {
            email,
            name: `E2E ${opts.tag}`,
            last_step: 'result',
            parameters: { goal: 'loss', height_cm: 170, weight_kg: 65 },
            result: { calories: 1800, protein: 120, fat: 50, carbs: 200, water_glasses: 8 },
            consents: { data_processing: true, contact: opts.contact ?? true },
        },
    })
    expect(response.ok(), `create lead (${opts.tag}) failed: ${response.status()} ${await response.text()}`).toBeTruthy()
    const body = await response.json()
    return { id: body.data.lead.id, email, token: body.data.token as string }
}

test.describe('Кураторская очередь заявок', () => {
    const seeded: SeededLead[] = []

    test.afterEach(async ({ request, baseURL }) => {
        const toClean = seeded.splice(0, seeded.length)
        for (const lead of toClean) {
            await request
                .get(`${baseURL}/api/v1/public/leads/unsubscribe?token=${encodeURIComponent(lead.token)}`)
                .catch(() => {})
        }
    })

    test('куратор видит заявки от старых к новым и отмечает заявку обработанной', async ({
        page,
        context,
        request,
        baseURL,
    }) => {
        await signIn(context, baseURL!, 'curator')

        // Заведены последовательно — тем же порядком, каким их видит очередь.
        const older = await createLead(request, baseURL!, { tag: 'order-a' })
        seeded.push(older)
        const newer = await createLead(request, baseURL!, { tag: 'order-b' })
        seeded.push(newer)

        await page.goto('/curator/leads')
        await expect(page.getByRole('heading', { name: 'Заявки' })).toBeVisible({ timeout: 20000 })

        const cards = page.getByTestId('lead-card')
        await expect(cards.filter({ hasText: newer.email })).toBeVisible({ timeout: 10000 })

        // Порядок — не пустое множество: обе заявки должны быть найдены, а не
        // только «отсутствие ошибки». На пустой очереди этот индекс был бы
        // -1 для обеих, и сравнение -1 < -1 солгало бы, что порядок верен.
        const emails = await cards.evaluateAll((nodes) =>
            nodes.map((node) => node.querySelector('p.text-sm.text-gray-700')?.textContent ?? '')
        )
        const olderIndex = emails.indexOf(older.email)
        const newerIndex = emails.indexOf(newer.email)
        expect(olderIndex, 'older lead must be present in the queue').toBeGreaterThanOrEqual(0)
        expect(newerIndex, 'newer lead must be present in the queue').toBeGreaterThanOrEqual(0)
        expect(olderIndex, 'the longer-waiting lead must come first').toBeLessThan(newerIndex)

        // Взятие в работу: карточка старейшей заявки, не «первая попавшаяся»
        // кнопка на странице — иначе тест мог бы случайно отметить чужую
        // заявку, если в очереди уже лежит что-то ещё.
        const olderCard = cards.filter({ hasText: older.email })
        await olderCard.getByRole('button', { name: 'Отметить обработанной' }).click()
        await expect(olderCard.getByText('Обработана')).toBeVisible()

        // Пропадает из очереди по умолчанию...
        await page.reload()
        await expect(page.getByTestId('lead-card').filter({ hasText: older.email })).toHaveCount(0)

        // ...но остаётся видна, когда куратор просит показать обработанные —
        // это не удаление, а отметка.
        await page.getByRole('checkbox', { name: 'Показывать обработанные' }).check()
        const olderCardAfterToggle = page.getByTestId('lead-card').filter({ hasText: older.email })
        await expect(olderCardAfterToggle).toBeVisible()
        await expect(olderCardAfterToggle.getByText('Обработана')).toBeVisible()
    })

    test('заявке без согласия на связь нет ссылки «Написать», а не выключенной кнопки', async ({
        page,
        context,
        request,
        baseURL,
    }) => {
        await signIn(context, baseURL!, 'curator')

        const noConsent = await createLead(request, baseURL!, { tag: 'no-consent', contact: false })
        seeded.push(noConsent)
        // Контроль: соседняя заявка с согласием — чтобы убедиться, что
        // ссылка «Написать» вообще может появиться на этой странице, и её
        // отсутствие у первой заявки не потому, что верстка сломана целиком.
        const withConsent = await createLead(request, baseURL!, { tag: 'with-consent', contact: true })
        seeded.push(withConsent)

        await page.goto('/curator/leads')
        await expect(page.getByRole('heading', { name: 'Заявки' })).toBeVisible({ timeout: 20000 })

        const cards = page.getByTestId('lead-card')
        const noConsentCard = cards.filter({ hasText: noConsent.email })
        const withConsentCard = cards.filter({ hasText: withConsent.email })
        await expect(noConsentCard).toBeVisible({ timeout: 10000 })
        await expect(withConsentCard).toBeVisible({ timeout: 10000 })

        await expect(noConsentCard.getByText('Согласия на связь нет — писать нельзя')).toBeVisible()
        // Не disabled-ссылка — элемента нет вовсе.
        await expect(noConsentCard.getByRole('link', { name: 'Написать' })).toHaveCount(0)
        await expect(noConsentCard.locator(`a[href="mailto:${noConsent.email}"]`)).toHaveCount(0)

        await expect(withConsentCard.getByRole('link', { name: 'Написать' })).toBeVisible()
    })

    test('обычный пользователь не попадает в очередь заявок', async ({ page, context, request, baseURL }) => {
        const token = await signIn(context, baseURL!, 'client')

        // Уровень API — то, что действительно решает: экран может ошибиться
        // в редиректе, но 403 здесь подделать нельзя.
        const apiResponse = await context.request.get(`${baseURL}/api/v1/curator/leads`, {
            headers: asUser(token),
        })
        expect(apiResponse.status()).toBe(403)

        // Уровень экрана — куда в итоге приземляется человек. Редирект решает
        // клиентский код (curator/layout.tsx) сразу после первой отрисовки,
        // иногда быстрее, чем у `goto` успевает наступить событие `load` — тогда
        // сама навигация в /curator/leads рвётся как ERR_ABORTED. Это не отказ
        // теста, а обычный побочный эффект гонки; дожидаемся результата, а не
        // самого перехода.
        await Promise.all([
            page.waitForURL('**/dashboard**', { timeout: 20000 }),
            page.goto('/curator/leads').catch(() => {}),
        ])
        expect(page.url()).toContain('/dashboard')
        await expect(page.getByRole('heading', { name: 'Заявки' })).toHaveCount(0)
    })

    test('супер-администратор попадает в заявки и обращения, но не в остальной кураторский раздел', async ({
        browser,
        baseURL,
    }) => {
        // Каждая проверка — в своём контексте, с ровно одним переходом.
        //
        // Сначала это было три перехода подряд в одной вкладке (заявки →
        // обращения → корень). Прогонялось нестабильно: `apiClient` держит
        // сессию на ротации refresh-токена (см. комментарии в api-client.ts) —
        // токен меняется при каждом обновлении, и второй запрос на обновление,
        // догоняющий первый до того, как тот применит новый токен, читается
        // сервером как повтор украденного и обрывает сессию целиком. Это
        // существующий риск самого механизма сессии, а не этой очереди
        // заявок, и не то, что здесь проверяется — независимые контексты его
        // не задевают.
        async function expectVisibleAs(path: string, heading: string) {
            const ctx = await browser.newContext()
            try {
                await signIn(ctx, baseURL!, 'admin')
                const p = await ctx.newPage()
                await p.goto(path)
                await expect(p.getByTestId('curator-layout')).toBeVisible({ timeout: 20000 })
                await expect(p.getByRole('heading', { name: heading })).toBeVisible({ timeout: 10000 })
            } finally {
                await ctx.close()
            }
        }

        await expectVisibleAs('/curator/leads', 'Заявки')
        await expectVisibleAs('/curator/support', 'Обращения')

        // Остальной кураторский раздел — клиентская аналитика — остаётся
        // закрыт. Чинили отдельным кругом правок: сперва администратор терял
        // доступ вообще, потом получил точечный, только к этим двум разделам.
        //
        // Уровень API — то, что действительно решает, и не подделать редиректом:
        // internal/router/curator.go охраняет группу ролью «coordinator» одной,
        // без super_admin.
        const apiCtx = await browser.newContext()
        try {
            const token = await signIn(apiCtx, baseURL!, 'admin')
            const clientsResponse = await apiCtx.request.get(`${baseURL}/api/v1/curator/clients`, {
                headers: asUser(token),
            })
            expect(clientsResponse.status()).toBe(403)
        } finally {
            await apiCtx.close()
        }

        // Уровень экрана, тем же способом: свой контекст, один переход.
        const uiCtx = await browser.newContext()
        try {
            await signIn(uiCtx, baseURL!, 'admin')
            const p = await uiCtx.newPage()
            await Promise.all([
                p.waitForURL('**/dashboard**', { timeout: 20000 }),
                p.goto('/curator').catch(() => {}),
            ])
            expect(p.url()).toContain('/dashboard')
        } finally {
            await uiCtx.close()
        }
    })

    test('повторная отметка не перезаписывает первую — второй куратор получает отказ своим кодом', async ({
        browser,
        request,
        baseURL,
    }) => {
        const lead = await createLead(request, baseURL!, { tag: 'claim-race' })
        seeded.push(lead)

        const ownerContext = await browser.newContext()
        const otherContext = await browser.newContext()
        try {
            await signIn(ownerContext, baseURL!, 'curator')
            await signIn(otherContext, baseURL!, 'other-curator')

            const ownerPage = await ownerContext.newPage()
            const otherPage = await otherContext.newPage()

            // Оба куратора открывают очередь, пока заявка ещё не взята —
            // именно так и случается гонка, которую защищает сервис: не один
            // клик опережает другой на сервере, а два куратора, открывшие
            // список в пределах пары мгновений друг от друга.
            await ownerPage.goto('/curator/leads')
            await otherPage.goto('/curator/leads')

            const ownerCard = ownerPage.getByTestId('lead-card').filter({ hasText: lead.email })
            const otherCard = otherPage.getByTestId('lead-card').filter({ hasText: lead.email })
            await expect(ownerCard).toBeVisible({ timeout: 20000 })
            await expect(otherCard).toBeVisible({ timeout: 20000 })

            await ownerCard.getByRole('button', { name: 'Отметить обработанной' }).click()
            await expect(ownerCard.getByText('Обработана')).toBeVisible()

            // Второй куратор всё ещё смотрит на устаревшее состояние — кнопка
            // у него ещё видна — и жмёт её.
            await otherCard.getByRole('button', { name: 'Отметить обработанной' }).click()

            // Отказ называет причину — не общий «действие невозможно», под
            // которым потерялось бы, кто именно опередил и что это чужая
            // заявка, а не сбой.
            await expect(otherPage.getByText('Заявка уже отмечена обработанной')).toBeVisible()
            await expect(otherPage.getByText('Действие невозможно в текущем состоянии')).toHaveCount(0)

            // Не молчаливая перезапись: у второго куратора карточка остаётся
            // в состоянии «не обработана мной» — кнопка на месте, а не ложное
            // «Обработана» от его собственного клика.
            await expect(otherCard.getByRole('button', { name: 'Отметить обработанной' })).toBeVisible()
        } finally {
            await ownerContext.close()
            await otherContext.close()
        }
    })
})
