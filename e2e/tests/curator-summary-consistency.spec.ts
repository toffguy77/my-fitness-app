import { test, expect, signIn, asUser } from '../fixtures/session'

/**
 * Сводка на главной куратора и списки под ней отвечают на один вопрос одинаково.
 *
 * Стоит вместо ручной проверки «сверить число в карточке с длиной списка
 * глазами». Из обращения: «8 активных, все в норме», а ниже — клиенты с «Нет
 * активности». Три величины считались тремя разными правилами, выданными рядом
 * на одном экране.
 *
 * Проверяется и через API, и на экране: правила выражены в SQL, и число,
 * совпавшее в ответе, ещё должно дойти до карточки.
 */

test.describe('сводка куратора', () => {
    test('число требующих внимания равно клиентам в списке внимания', async ({
        context,
        baseURL,
    }) => {
        const token = await signIn(context, baseURL!, 'curator')

        const [analyticsResponse, attentionResponse] = await Promise.all([
            context.request.get(`${baseURL}/api/v1/curator/analytics`, { headers: asUser(token) }),
            context.request.get(`${baseURL}/api/v1/curator/attention`, { headers: asUser(token) }),
        ])
        expect(analyticsResponse.ok(), await analyticsResponse.text()).toBeTruthy()
        expect(attentionResponse.ok(), await attentionResponse.text()).toBeTruthy()

        const analytics = (await analyticsResponse.json()).data
        const attention = (await attentionResponse.json()).data as Array<{ client_id: number }>

        const distinct = new Set(attention.map((item) => item.client_id))

        expect(
            analytics.attention_clients,
            'карточка «требуют внимания» и список под ней считают по-разному',
        ).toBe(distinct.size)
    })

    test('число активных клиентов равно списку клиентов', async ({ context, baseURL }) => {
        const token = await signIn(context, baseURL!, 'curator')

        const [analyticsResponse, clientsResponse] = await Promise.all([
            context.request.get(`${baseURL}/api/v1/curator/analytics`, { headers: asUser(token) }),
            context.request.get(`${baseURL}/api/v1/curator/clients`, { headers: asUser(token) }),
        ])
        const analytics = (await analyticsResponse.json()).data
        const clients = (await clientsResponse.json()).data as unknown[]

        expect(
            analytics.total_clients,
            'карточка «активные клиенты» считала без фильтра окна удаления',
        ).toBe(clients.length)
    })

    test('непрочитанное в сводке равно непрочитанному по разговорам', async ({
        context,
        baseURL,
    }) => {
        const token = await signIn(context, baseURL!, 'curator')

        const [analyticsResponse, conversationsResponse] = await Promise.all([
            context.request.get(`${baseURL}/api/v1/curator/analytics`, { headers: asUser(token) }),
            context.request.get(`${baseURL}/api/v1/conversations`, { headers: asUser(token) }),
        ])
        const analytics = (await analyticsResponse.json()).data
        const conversations = (await conversationsResponse.json()).data as Array<{
            unread_count: number
        }>

        const sum = conversations.reduce((total, conv) => total + (conv.unread_count || 0), 0)
        const waiting = conversations.filter((conv) => (conv.unread_count || 0) > 0).length

        // Сводка обнуляла непрочитанное, когда активных связей не было, а список
        // чатов продолжал показывать значки.
        expect(analytics.total_unread, 'сводка и список чатов расходятся').toBe(sum)
        expect(analytics.clients_waiting).toBe(waiting)
    })

    test('карточка на экране показывает то же число, что список под ней', async ({ page }) => {
        await page.goto('/curator')
        await expect(page.getByTestId('curator-layout')).toBeVisible({ timeout: 15000 })

        const attentionCard = page.getByText(/требуют внимания: \d+|все в норме/).first()
        await expect(attentionCard).toBeVisible({ timeout: 15000 })

        const cardText = (await attentionCard.textContent()) ?? ''
        const claimed = cardText.includes('все в норме')
            ? 0
            : Number(cardText.match(/требуют внимания: (\d+)/)?.[1] ?? -1)
        expect(claimed, `не удалось прочитать число из карточки: ${cardText}`).toBeGreaterThanOrEqual(0)

        const attentionHeading = page.getByText('Требуют внимания').first()
        if (claimed === 0) {
            // «Все в норме» обязано означать пустой список, а не «правило
            // карточки никого не увидело».
            await expect(attentionHeading).toHaveCount(0)
            return
        }

        await expect(attentionHeading).toBeVisible()
        // Список сгруппирован по клиенту, поэтому строк ровно столько, сколько
        // клиентов требуют внимания.
        await expect(
            page.getByTestId('attention-item'),
            'на экране столько клиентов, сколько обещала карточка',
        ).toHaveCount(claimed)
    })

    test('карточка непрочитанного подписана непрочитанным, а не сообщениями', async ({ page }) => {
        // Подпись «Сообщения» над числом непрочитанного читалась как
        // «сообщений нет»: ноль над существующей перепиской выглядит потерей
        // данных.
        await page.goto('/curator')
        await expect(page.getByTestId('curator-layout')).toBeVisible({ timeout: 15000 })

        await expect(page.getByText('Непрочитанные').first()).toBeVisible({ timeout: 15000 })
        await expect(page.getByText('Сообщения', { exact: true })).toHaveCount(0)
    })
})
