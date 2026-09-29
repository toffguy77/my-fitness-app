import { test, expect, signIn, asUser } from '../fixtures/session'
import { freshAddress } from '../fixtures/mail'

/**
 * Платный доступ к куратору — со стороны браузера и со стороны API.
 *
 * Стоит потому, что покрыть этот запрет прогоном иначе нельзя: каждая учётная
 * запись, которую прогон заводит, попадает под шаблон служебных (`@burcev.test`
 * — иначе зачистка стенда её не найдёт), а служебным доступ выдаётся бессрочно,
 * чтобы прогон не упёрся в собственный paywall. То есть по умолчанию прогон
 * ходит по продукту с правами оплатившего и о запрете ничего не знает.
 *
 * Поэтому состояние без доступа создаётся тем же способом, каким оно возникает
 * в жизни: администратор снимает доступ. Так проверяются сразу оба конца —
 * админские действия выдачи и снятия, и то, что видит клиент.
 *
 * Проверяется и то, чего запрет НЕ закрывает: чтение прежней переписки.
 * Написанное человеком не становится недоступным ему из-за окончания оплаты, а
 * запрет, закрывший и чтение, был бы хуже отсутствующего.
 */

test.use({ role: undefined })

const PASSWORD = 'E2eStand!2026'

interface Registered {
    userId: number
    token: string
}

/**
 * Заводит клиента и возвращает его идентификатор и токен.
 *
 * Адрес от `freshAddress` попадает под шаблоны зачистки стенда и под шаблон
 * служебных учётных записей — значит куратор ему назначается, и снимать доступ
 * будет что.
 */
async function registerClient(
    context: import('@playwright/test').BrowserContext,
    baseURL: string,
): Promise<Registered> {
    const response = await context.request.post(`${baseURL}/api/v1/auth/register`, {
        data: {
            email: freshAddress('paywall'),
            password: PASSWORD,
            name: 'Клиент Платного Доступа',
            consents: {
                terms_of_service: true,
                privacy_policy: true,
                data_processing: true,
                marketing: false,
            },
        },
    })
    expect(response.status(), await response.text()).toBe(201)

    const body = await response.json()
    const userId = body?.data?.user?.id
    const token = body?.data?.token
    expect(userId, 'регистрация не вернула идентификатор').toBeTruthy()
    expect(token, 'регистрация не вернула токен').toBeTruthy()
    return { userId, token }
}

/**
 * Административный токен — один на весь файл.
 *
 * Отдельный вход на каждую проверку упирается в ограничитель попыток входа: их
 * десять на четверть часа, а неудачная попытка запрет продлевает. Токен живёт
 * пятнадцать минут — дольше, чем этот файл.
 */
let cachedAdmin: Promise<string> | null = null

function adminToken(
    browser: import('@playwright/test').Browser,
    baseURL: string,
): Promise<string> {
    if (!cachedAdmin) {
        cachedAdmin = (async () => {
            const context = await browser.newContext({ baseURL })
            try {
                return await signIn(context, baseURL, 'admin')
            } finally {
                await context.close()
            }
        })()
    }
    return cachedAdmin
}

/** Снимает доступ к куратору у клиента. */
async function revokeAccess(
    context: import('@playwright/test').BrowserContext,
    baseURL: string,
    adminBearer: string,
    clientId: number,
): Promise<void> {
    const response = await context.request.delete(
        `${baseURL}/api/v1/admin/assignments/${clientId}`,
        { headers: asUser(adminBearer) },
    )
    expect(response.ok(), await response.text()).toBeTruthy()
}

interface AccessState {
    allowed: boolean
    expired: boolean
    expires_at?: string
    conversation_id?: string
}

/** Состояние права, как его видит сам клиент. */
async function accessOf(
    context: import('@playwright/test').BrowserContext,
    baseURL: string,
    clientBearer: string,
): Promise<AccessState> {
    const response = await context.request.get(`${baseURL}/api/v1/conversations/access`, {
        headers: asUser(clientBearer),
    })
    expect(response.ok(), await response.text()).toBeTruthy()
    return (await response.json())?.data
}

/** Кто назначен куратором этому клиенту — по данным админки. */
async function curatorOf(
    context: import('@playwright/test').BrowserContext,
    baseURL: string,
    adminBearer: string,
    clientId: number,
): Promise<number> {
    const response = await context.request.get(`${baseURL}/api/v1/admin/users/${clientId}`, {
        headers: asUser(adminBearer),
    })
    expect(response.ok(), await response.text()).toBeTruthy()
    const curatorId = (await response.json())?.data?.curator_id
    expect(
        curatorId,
        'у служебной учётной записи нет куратора — выдавать заново нечего',
    ).toBeTruthy()
    return curatorId
}

test.describe('платный доступ к куратору', () => {
    test('без доступа переписка закрыта на API, а чтение открыто', async ({
        context,
        browser,
        baseURL,
    }) => {
        const client = await registerClient(context, baseURL!)
        const admin = await adminToken(browser, baseURL!)

        // Пока доступ есть — состояние права отвечает, и переписка находится.
        const before = await accessOf(context, baseURL!, client.token)
        expect(before.allowed, 'служебной учётной записи доступ выдаётся').toBe(true)
        const conversationId = before.conversation_id
        expect(conversationId, 'переписки нет — снимать доступ не с чего').toBeTruthy()

        await revokeAccess(context, baseURL!, admin, client.userId)

        // Отправка отбивается на уровне API: платный доступ, закрытый только
        // интерфейсом, открыт любому, кто обратится к API напрямую.
        const send = await context.request.post(
            `${baseURL}/api/v1/conversations/${conversationId}/messages`,
            {
                headers: asUser(client.token),
                data: { type: 'text', content: 'а можно?' },
            },
        )
        expect(send.status()).toBe(403)
        expect(await send.text()).toContain('curator_access_required')

        // Чтение прежней переписки осталось открытым.
        const read = await context.request.get(
            `${baseURL}/api/v1/conversations/${conversationId}/messages`,
            { headers: asUser(client.token) },
        )
        expect(read.status(), await read.text()).toBe(200)

        // Состояние права различает «кончилось» и «не было».
        const after = await accessOf(context, baseURL!, client.token)
        expect(after.allowed).toBe(false)
        expect(after.expired, 'куратор был — значит предлагать нужно продление').toBe(true)
    })

    test('на месте переписки — предложение купить, а вход в неё живой', async ({
        page,
        context,
        browser,
        baseURL,
    }) => {
        const client = await registerClient(context, baseURL!)
        const admin = await adminToken(browser, baseURL!)
        await revokeAccess(context, baseURL!, admin, client.userId)

        // Вход остаётся живым: отключённая кнопка читалась бы как поломка.
        await page.goto('/chat')

        const offer = page.getByTestId('curator-offer')
        await expect(offer).toBeVisible({ timeout: 20000 })
        await expect(offer.getByText('Продлить доступ')).toBeVisible()

        // Цена живёт на одной странице, и предложение ведёт туда.
        await expect(offer.getByRole('link', { name: 'Сколько стоит' })).toHaveAttribute(
            'href',
            '/pricing',
        )
    })

    test('карточка куратора на дашборде предлагает купить, а не поддержку', async ({
        page,
        context,
        browser,
        baseURL,
    }) => {
        const client = await registerClient(context, baseURL!)
        const admin = await adminToken(browser, baseURL!)
        await revokeAccess(context, baseURL!, admin, client.userId)

        await page.goto('/dashboard')

        await expect(page.getByTestId('curator-offer')).toBeVisible({ timeout: 20000 })
        // Отправлять человека в поддержку за тем, что должно быть написано на
        // месте, — худшее из возможного.
        await expect(page.getByText('Напишите в поддержку — разберёмся')).toHaveCount(0)

        // Задание, заведомо оканчивающееся отказом, не предлагается.
        await expect(page.getByRole('link', { name: 'Познакомиться с куратором' })).toHaveCount(0)
    })

    test('выданный заново доступ возвращает переписку', async ({ context, browser, baseURL }) => {
        const client = await registerClient(context, baseURL!)
        const admin = await adminToken(browser, baseURL!)

        const before = await accessOf(context, baseURL!, client.token)
        const conversationId = before.conversation_id
        const curatorId = await curatorOf(context, baseURL!, admin, client.userId)

        await revokeAccess(context, baseURL!, admin, client.userId)

        // Выдача требует даты: бессрочное право у живого человека неотличимо от
        // забытой даты.
        const until = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
        const granted = await context.request.post(`${baseURL}/api/v1/admin/assignments`, {
            headers: asUser(admin),
            data: {
                client_id: client.userId,
                curator_id: curatorId,
                access_expires_at: until,
            },
        })
        expect(granted.ok(), await granted.text()).toBeTruthy()

        const send = await context.request.post(
            `${baseURL}/api/v1/conversations/${conversationId}/messages`,
            {
                headers: asUser(client.token),
                data: { type: 'text', content: 'здравствуйте' },
            },
        )
        expect(send.status(), await send.text()).toBe(201)

        // Переписка та же: повторная выдача тому же куратору не заводит новую,
        // иначе история работы рвалась бы на каждой оплате.
        const after = await accessOf(context, baseURL!, client.token)
        expect(after.allowed).toBe(true)
        expect(after.conversation_id).toBe(conversationId)
        expect(after.expires_at).toBe(until)
    })
})
