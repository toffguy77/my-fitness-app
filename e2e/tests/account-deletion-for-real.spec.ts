import { test, expect } from '../fixtures/session'
import { SettingsPrivacyPage } from '../pages/settings.page'
import { waitForLetter, codeFromLetter, freshAddress } from '../fixtures/mail'
import { AuthPage } from '../pages/auth.page'
// Подписи — из того же словаря, что и разметка: вписанные сюда строками, они
// разошлись бы с ним при первой правке текста (см. комментарий в auth.page.ts).
import { ru } from '../../apps/web/src/shared/i18n/dictionaries/ru'

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
 * Первая версия этого файла ждала, что страница настроек переживёт
 * перезагрузку, — и покраснела. Красным был тест: запрос удаления по замыслу
 * обрывает все сессии учётки («аккаунт с этого момента деактивирован, а
 * действующий токен этому противоречил бы» — account/service.go), так что
 * человека выкидывает, и дорога назад у него одна — войти заново и отменить
 * удаление с экрана возвращения. Подмена в соседнем файле скрывала не дефект,
 * а целый кусок замысла, которого не проверял никто.
 *
 * Требует ловца почты, поэтому живёт рядом с `registration.spec.ts`: на
 * стенде CI он есть, против dev или прода этот файл не запускают.
 */

const PASSWORD = 'Stand!Passw0rd#2026'
const CONFIRMATION = 'УДАЛИТЬ'

test.use({ role: undefined })

test.describe('Удаление аккаунта без подмен', () => {
    test('назначается на сервере, обрывает сессию и отменяется при возвращении', async ({
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

        // Сервер называет срок — и говорит это до того, как сессия кончится.
        const state = await context.request.get(`${baseURL}/api/v1/users/me/deletion`, {
            headers: { Authorization: `Bearer ${token}` },
        })
        expect(state.status(), await state.text()).toBe(200)
        expect(
            (await state.json())?.data?.scheduled_for,
            'сервер не назвал срок удаления',
        ).toBeTruthy()

        // А теперь то, ради чего этот файл и переписан.
        //
        // Запрос удаления по замыслу обрывает ВСЕ сессии учётки: «аккаунт с
        // этого момента деактивирован, а действующий токен этому противоречил
        // бы» (account/service.go). Значит перезагрузка страницы настроек
        // обязана выкинуть человека, а не показать ему ту же страницу.
        //
        // Первая версия этого теста ждала обратного — что страница настроек
        // переживёт перезагрузку, — и покраснела. Красным был тест, а не
        // продукт: подмена в соседнем файле скрывала не дефект, а целый кусок
        // замысла, которого никто не проверял.
        await page.reload()
        await page.waitForURL(/\/auth/, { timeout: 15000 })
        await expect(privacy.deleteHeading).toBeHidden()

        // Вернуться можно только войдя заново — и вход показывает дорогу
        // назад вместо личного кабинета.
        // Через AuthPage, а не своими кликами: там уже решена ловушка
        // потерянного клика по «Войти по паролю» — кнопка отрисована сервером
        // раньше, чем к ней привязан обработчик, и одиночный клик попадает в
        // это окно и не делает ничего.
        const auth = new AuthPage(page)
        await auth.goto()
        await auth.login(address, PASSWORD)

        await expect(page.getByText(ru.auth.recovery.title)).toBeVisible({ timeout: 15000 })

        // Отмена — по-настоящему: иначе учётка ушла бы в удаление, а тест
        // отчитался бы об успехе.
        const [cancelled] = await Promise.all([
            page.waitForResponse(
                (res) =>
                    res.request().method() === 'DELETE' &&
                    new URL(res.url()).pathname === '/api/v1/users/me/deletion',
            ),
            page.getByRole('button', { name: ru.auth.recovery.cancel }).click(),
        ])
        expect(cancelled.status(), await cancelled.text()).toBeLessThan(300)

        // И человек действительно вернулся: страница настроек снова открыта,
        // срока на ней нет. Аккаунт, который «отменил удаление», но в который
        // нельзя войти, — это удалённый аккаунт с вежливой надписью.
        await privacy.goto()
        await privacy.expectLoaded()
        await expect(privacy.scheduledNotice).toBeHidden()
    })
})
