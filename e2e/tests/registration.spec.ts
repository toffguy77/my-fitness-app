import { test, expect } from '../fixtures/session'
import { waitForLetter, codeFromLetter, freshAddress } from '../fixtures/mail'

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

test.use({ role: undefined })

const PASSWORD = 'Stand!Passw0rd#2026'

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
