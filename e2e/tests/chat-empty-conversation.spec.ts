import { test, expect, signIn, asUser } from '../fixtures/session'

/**
 * Что строка в списке чатов сообщает об активности.
 *
 * Стоит вместо ручной проверки «посмотреть, как выглядит пустой разговор».
 * Разговор без единого сообщения печатал `updated_at`, а у пустого разговора это
 * момент создания записи: в одной строке оказывались «вчера» и «Нет сообщений».
 * Куратор не мог отличить чат, где клиент писал вчера, от чата, который вчера
 * создали при назначении.
 *
 * Разговоры создаются сами на каждом пути внутрь, поэтому пустых у куратора
 * столько же, сколько клиентов, которые ему ещё не написали.
 */

test.describe('список чатов', () => {
    test('у разговора без сообщений нет времени', async ({ page, context, baseURL }) => {
        const token = await signIn(context, baseURL!, 'curator')

        // Сначала спрашиваем сервер: сколько разговоров пусты. Без этого
        // проверка на экране может пройти вхолостую — не потому, что дефекта
        // нет, а потому, что нечего проверять.
        const response = await context.request.get(`${baseURL}/api/v1/conversations`, {
            headers: asUser(token),
        })
        expect(response.ok(), await response.text()).toBeTruthy()
        const conversations = (await response.json()).data as Array<{
            participant: { name: string }
            last_message: unknown | null
        }>

        const empty = conversations.filter((conv) => !conv.last_message)
        test.skip(
            empty.length === 0,
            'у этого куратора нет разговоров без сообщений — проверять нечего',
        )

        await page.goto('/curator/chat')
        const rows = page.getByRole('listitem')
        await expect(rows.first()).toBeVisible({ timeout: 15000 })

        // Инвариант: строка, в которой написано «Нет сообщений», не показывает
        // времени. Проверяется по всем строкам, а не по одной выбранной.
        const emptyRows = rows.filter({ hasText: 'Нет сообщений' })
        await expect(emptyRows).toHaveCount(empty.length)

        const count = await emptyRows.count()
        for (let i = 0; i < count; i++) {
            const text = (await emptyRows.nth(i).textContent()) ?? ''
            expect(
                text,
                `пустой разговор показывает время: ${text.trim()}`,
            ).not.toMatch(/только что|мин назад|ч назад|вчера|\d{2}\.\d{2}\.\d{4}/)
        }
    })

    test('разговоры без сообщений стоят после тех, в которых писали', async ({
        page,
        context,
        baseURL,
    }) => {
        const token = await signIn(context, baseURL!, 'curator')
        const response = await context.request.get(`${baseURL}/api/v1/conversations`, {
            headers: asUser(token),
        })
        const conversations = (await response.json()).data as Array<{
            id: string
            unread_count: number
            last_message: unknown | null
        }>

        test.skip(conversations.length < 2, 'для порядка нужно хотя бы два разговора')
        test.skip(
            conversations.some((conv) => (conv.unread_count || 0) > 0),
            'непрочитанные идут первыми по отдельному правилу — порядок проверяется без них',
        )

        // Переписку заводим сами, а не надеемся её найти: на свежем стенде все
        // разговоры пусты, и проверка прошла бы вхолостую. Пишет куратор, то
        // есть непрочитанного для него не появляется и правило «непрочитанные
        // первыми» в дело не вступает.
        let withMessages = conversations.filter((conv) => conv.last_message)
        if (withMessages.length === 0) {
            const sent = await context.request.post(
                `${baseURL}/api/v1/conversations/${conversations[0].id}/messages`,
                { headers: asUser(token), data: { type: 'text', content: 'порядок списка' } },
            )
            expect(sent.ok(), await sent.text()).toBeTruthy()
            withMessages = [conversations[0]]
        }

        await page.goto('/curator/chat')
        const rows = page.getByRole('listitem')
        await expect(rows.first()).toBeVisible({ timeout: 15000 })

        const texts = await rows.allTextContents()
        const lastWithMessage = texts.reduce(
            (last, text, index) => (text.includes('Нет сообщений') ? last : index),
            -1,
        )
        const firstEmpty = texts.findIndex((text) => text.includes('Нет сообщений'))

        test.skip(firstEmpty === -1, 'пустых разговоров нет — проверять порядок не с чем')
        expect(
            firstEmpty,
            'пустой разговор поднялся выше переписки — раньше его поднимала дата создания',
        ).toBeGreaterThan(lastWithMessage)
    })
})
