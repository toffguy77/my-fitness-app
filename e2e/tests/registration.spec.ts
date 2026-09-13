import { test, expect } from '../fixtures/session'

/**
 * Регистрация с подтверждением адреса — целиком.
 *
 * Путь, который проходит каждый без исключения, не был покрыт ничем: набор
 * входил только готовыми учётными записями, которые заводит сеятель в обход
 * самой регистрации. Ловец почты при этом уже стоял — им пользовалась проверка
 * дайджеста, — так что прочитать код подтверждения было нечем только потому,
 * что никто не пробовал.
 *
 * Проверяется не «форма отправилась», а то, ради чего форма существует: письмо
 * действительно ушло, в нём действительно есть код, код действительно
 * подтверждает адрес, и после этого человек действительно может войти.
 */

const MAILPIT = process.env.MAILPIT_URL || 'http://localhost:8025'

test.use({ role: undefined })

/** Свой адрес на каждый прогон: иначе второй прогон упрётся в первый. */
function freshAddress(): string {
    return `stand-${Date.now()}-${Math.floor(Math.random() * 1000)}@burcev.test`
}

const PASSWORD = 'Stand!Passw0rd#2026'

interface MailpitMessage {
    ID: string
    Subject: string
}

/** Письмо для адреса, самое свежее. Ждём: почта уходит не мгновенно. */
async function waitForLetter(
    request: import('@playwright/test').APIRequestContext,
    address: string,
): Promise<MailpitMessage> {
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
 * Шестизначный код из письма.
 *
 * Берём из текста письма, а не из базы: смысл проверки в том, что человек
 * получает код, которым можно воспользоваться. Код, верный в базе и
 * испорченный шаблоном, — это ровно тот отказ, который здесь и ловится.
 */
async function codeFromLetter(
    request: import('@playwright/test').APIRequestContext,
    messageID: string,
): Promise<string> {
    const response = await request.get(`${MAILPIT}/api/v1/message/${messageID}`)
    expect(response.ok(), 'письмо не читается').toBeTruthy()
    const body = await response.json()
    const text = `${body.Text ?? ''}\n${body.HTML ?? ''}`

    const code = text.match(/\b(\d{6})\b/)
    expect(code, `в письме нет шестизначного кода:\n${text.slice(0, 400)}`).toBeTruthy()
    return code![1]
}

test.describe('Регистрация', () => {
    test('письмо с кодом приходит, код подтверждает адрес, вход работает', async ({
        context,
        request,
        baseURL,
    }) => {
        const address = freshAddress()

        const registered = await context.request.post(`${baseURL}/api/v1/auth/register`, {
            data: {
                email: address,
                password: PASSWORD,
                name: 'Проверка регистрации',
                consents: {
                    terms_of_service: true,
                    privacy_policy: true,
                    data_processing: true,
                    marketing: false,
                },
            },
        })
        expect(registered.status(), await registered.text()).toBe(201)

        const token = (await registered.json())?.data?.token
        expect(token, 'регистрация не вернула токен — подтверждать адрес будет нечем').toBeTruthy()

        const letter = await waitForLetter(request, address)
        const code = await codeFromLetter(request, letter.ID)

        const verified = await context.request.post(`${baseURL}/api/v1/auth/verify-email`, {
            headers: { Authorization: `Bearer ${token}` },
            data: { code },
        })
        expect(verified.status(), await verified.text()).toBeLessThan(400)

        // Главное: после подтверждения человек входит тем, что задал сам.
        const signedIn = await context.request.post(`${baseURL}/api/v1/auth/login`, {
            data: { email: address, password: PASSWORD },
        })
        expect(signedIn.status(), await signedIn.text()).toBe(200)
        expect((await signedIn.json())?.data?.token, 'вход не вернул токен').toBeTruthy()
    })

    // Неверный код обязан отказывать: код, который подходит любой, — это
    // отсутствие подтверждения, выглядящее как подтверждение.
    test('неверный код не подтверждает адрес', async ({ context, baseURL }) => {
        const address = freshAddress()

        const registered = await context.request.post(`${baseURL}/api/v1/auth/register`, {
            data: {
                email: address,
                password: PASSWORD,
                name: 'Проверка регистрации',
                consents: {
                    terms_of_service: true,
                    privacy_policy: true,
                    data_processing: true,
                    marketing: false,
                },
            },
        })
        expect(registered.status(), await registered.text()).toBe(201)
        const token = (await registered.json())?.data?.token

        const refused = await context.request.post(`${baseURL}/api/v1/auth/verify-email`, {
            headers: { Authorization: `Bearer ${token}` },
            data: { code: '000000' },
        })

        expect(refused.status()).toBeGreaterThanOrEqual(400)
        expect(refused.status()).toBeLessThan(500)
    })

    // Тот же адрес дважды — отказ, и отказ внятный: иначе человек, забывший о
    // прежней регистрации, упирается в стену без объяснения.
    test('повторная регистрация того же адреса отклоняется', async ({ context, baseURL }) => {
        const address = freshAddress()
        const payload = {
            email: address,
            password: PASSWORD,
            name: 'Проверка регистрации',
            consents: {
                terms_of_service: true,
                privacy_policy: true,
                data_processing: true,
                marketing: false,
            },
        }

        const first = await context.request.post(`${baseURL}/api/v1/auth/register`, { data: payload })
        expect(first.status(), await first.text()).toBe(201)

        const second = await context.request.post(`${baseURL}/api/v1/auth/register`, { data: payload })

        expect(second.status()).toBeGreaterThanOrEqual(400)
        expect(second.status()).toBeLessThan(500)
        const body = await second.json()
        expect(body?.code, `отказ без машиночитаемого кода: ${JSON.stringify(body)}`).toBeTruthy()
    })
})
