import { test, expect } from '../fixtures/session'
import { SettingsPrivacyPage } from '../pages/settings.page'
import { waitForLetter, codeFromLetter, freshAddress } from '../fixtures/mail'

/**
 * Удаление аккаунта — по-настоящему, от регистрации до отмены.
 *
 * `account-deletion.spec.ts` покрывает форму: кнопка заперта, пока не введены
 * пароль и слово, неверный пароль назван неверным паролем, отказ сервера
 * показан человеку. Все шесть проверок при этом **подменяют сам запрос
 * удаления** — и не зря: удалять данные учётки, под которой ходит остальной
 * набор, нельзя.
 *
 * Но из-за подмены ни одна из них не проходит настоящий путь. Работает ли
 * `POST /api/v1/users/me/deletion` на живом сервере, переживает ли назначенный
 * срок перезагрузку страницы, отменяется ли удаление на самом деле — об этом
 * шесть зелёных тестов не говорят ничего. Ровно такие швы в этом наборе уже
 * трижды прятали дефекты.
 *
 * Здесь подмен нет. Учётная запись заводится своя, одноразовая, тем же путём,
 * каким её заводит человек — с настоящим письмом и настоящим кодом
 * подтверждения, — и удаление на ней запрашивается по-настоящему. Удаление
 * отложенное: аккаунт не исчезает в момент запроса, а получает срок, и тест
 * этот срок отменяет. Данные при этом не гибнут ни на секунду, а адрес на
 * `burcev.test` подпадает под шаблоны зачистки.
 *
 * Требует ловца почты, поэтому живёт рядом с `registration.spec.ts`: на
 * стенде CI он есть, против dev или прода этот файл не запускают.
 */

const PASSWORD = 'Stand!Passw0rd#2026'
const CONFIRMATION = 'УДАЛИТЬ'

test.use({ role: undefined })

test.describe('Удаление аккаунта без подмен', () => {
    test('назначается на сервере, переживает перезагрузку и отменяется', async ({
        page,
        context,
        request,
        baseURL,
    }) => {
        const address = freshAddress('e2e-lead-deletion')

        const registered = await context.request.post(`${baseURL}/api/v1/auth/register`, {
            data: {
                email: address,
                password: PASSWORD,
                name: 'Проверка удаления',
                consents: {
                    terms_of_service: true,
                    privacy_policy: true,
                    data_processing: true,
                    marketing: false,
                },
            },
        })
        expect(registered.status(), await registered.text()).toBe(201)
        const registrationToken = (await registered.json())?.data?.token
        expect(registrationToken, 'регистрация не вернула токен').toBeTruthy()

        const letter = await waitForLetter(request, address)
        const code = await codeFromLetter(request, letter.ID)
        const verified = await context.request.post(`${baseURL}/api/v1/auth/verify-email`, {
            headers: { Authorization: `Bearer ${registrationToken}` },
            data: { code },
        })
        expect(verified.status(), await verified.text()).toBeLessThan(400)

        // Вход — не формой, а тем же вызовом, каким входит весь набор: куки
        // сервера ложатся на контекст, и страница берёт их сама.
        const signedIn = await context.request.post(`${baseURL}/api/v1/auth/login`, {
            data: { email: address, password: PASSWORD },
        })
        expect(signedIn.status(), await signedIn.text()).toBe(200)
        const token = (await signedIn.json())?.data?.token

        const privacy = new SettingsPrivacyPage(page)
        await privacy.goto()
        await privacy.expectLoaded()
        await privacy.openDeleteForm()

        await privacy.passwordInput.fill(PASSWORD)
        await privacy.confirmPhraseInput.fill(CONFIRMATION)

        // Ответ ловим настоящий: 2xx от сервера, а не то, что нарисовала
        // подмена. Это и есть разница между этим файлом и соседним.
        const [scheduled] = await Promise.all([
            page.waitForResponse(
                (res) =>
                    res.request().method() === 'POST' &&
                    new URL(res.url()).pathname === '/api/v1/users/me/deletion',
            ),
            privacy.confirmDeleteButton.click(),
        ])
        expect(scheduled.status(), await scheduled.text()).toBeLessThan(300)

        await expect(privacy.scheduledNotice).toBeVisible()

        // Перезагрузка отделяет состояние сервера от состояния вкладки:
        // назначенный срок, живущий только в памяти страницы, здесь пропадёт.
        await page.reload()
        await privacy.expectLoaded()
        await expect(privacy.scheduledNotice).toBeVisible()

        // И сервер говорит то же самое, что показывает страница.
        const state = await context.request.get(`${baseURL}/api/v1/users/me/deletion`, {
            headers: { Authorization: `Bearer ${token}` },
        })
        expect(state.status(), await state.text()).toBe(200)
        const scheduledFor = (await state.json())?.data?.scheduled_for
        expect(scheduledFor, 'сервер не назвал срок удаления').toBeTruthy()

        // Отмена — тоже по-настоящему: иначе учётка ушла бы в удаление,
        // а тест отчитался бы об успехе.
        const [cancelled] = await Promise.all([
            page.waitForResponse(
                (res) =>
                    res.request().method() === 'DELETE' &&
                    new URL(res.url()).pathname === '/api/v1/users/me/deletion',
            ),
            privacy.cancelDeletionButton.click(),
        ])
        expect(cancelled.status(), await cancelled.text()).toBeLessThan(300)

        await expect(privacy.scheduledNotice).toBeHidden()

        await page.reload()
        await privacy.expectLoaded()
        await expect(privacy.scheduledNotice).toBeHidden()

        // Главное после отмены: вход по-прежнему работает. Аккаунт, который
        // «отменил удаление», но войти в него нельзя, — это удалённый аккаунт
        // с вежливой надписью.
        const afterCancel = await context.request.post(`${baseURL}/api/v1/auth/login`, {
            data: { email: address, password: PASSWORD },
        })
        expect(afterCancel.status(), await afterCancel.text()).toBe(200)
    })
})
