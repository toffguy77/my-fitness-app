import { test, expect } from '../fixtures/session'

/**
 * Задача 9 переписала посадочную страницу целиком: шесть карточек
 * возможностей стали до четырёх тезисов, вход и регистрация разведены как
 * два разных перехода, а «Готовы начать?» превратился в CTA-блок без
 * действия расчёта. Прежняя версия этого файла проверяла разметку, которой
 * больше нет («Всё для контроля питания», «Создать аккаунт», карточки
 * поиска/сканера/дневника) — эти проверки были красными с момента переписи
 * и остановили бы любой PR в main, попади они в прогон.
 */

test.describe('Посадочная страница', () => {
    test.beforeEach(async ({ page }) => {
        // Clear any auth state for public page testing
        await page.context().clearCookies()
        await page.goto('/')
    })

    test('шапка: логотип и вход/регистрация как два разных перехода', async ({ page }) => {
        const header = page.getByRole('banner')
        await expect(header).toBeVisible({ timeout: 15000 })

        const signIn = header.getByRole('link', { name: 'Войти' })
        const register = header.getByRole('link', { name: 'Регистрация' })

        await expect(signIn).toHaveAttribute('href', '/auth')
        await expect(register).toHaveAttribute('href', '/auth?mode=register')
    })

    test('герой: главное действие — гостевой расчёт, рядом тихая ссылка входа', async ({
        page,
    }) => {
        await expect(
            page.getByRole('heading', {
                level: 1,
                name: /норма КБЖУ за минуту/i,
            })
        ).toBeVisible({ timeout: 15000 })

        // Главное действие живёт внутри <main>, не в шапке — обход по
        // ориентирам не должен миновать ни заголовок, ни кнопку.
        const main = page.getByRole('main')
        const calculate = main.getByRole('link', { name: 'Рассчитать мою норму' }).first()
        await expect(calculate).toBeVisible()
        await expect(calculate).toHaveAttribute('href', '/onboarding')

        const haveAccount = page.getByRole('link', { name: /уже есть аккаунт/i })
        await expect(haveAccount).toHaveAttribute('href', '/auth')
    })

    test('раздел тезисов виден и содержит утверждение про куратора', async ({ page }) => {
        await expect(
            page.getByRole('heading', { name: 'Чем мы отличаемся' })
        ).toBeVisible({ timeout: 15000 })

        // Не обусловлено способностями API — присутствует всегда.
        await expect(page.getByText(/куратор видит дневник/i)).toBeVisible()
    })

    test('блок призыва перед подвалом даёт вход и регистрацию, не расчёт', async ({ page }) => {
        const cta = page.getByTestId('landing-cta')
        await expect(cta).toBeVisible({ timeout: 15000 })

        const signIn = cta.getByRole('link', { name: /войти/i })
        const register = cta.getByRole('link', { name: /регистрац/i })

        await expect(signIn).toHaveAttribute('href', '/auth')
        await expect(register).toHaveAttribute('href', '/auth?mode=register')
        await expect(cta.getByRole('link', { name: /рассчитать/i })).toHaveCount(0)
    })

    test('footer has navigation links', async ({ page }) => {
        await expect(page.getByRole('link', { name: 'Статьи' })).toBeVisible({
            timeout: 15000,
        })
        await expect(page.getByRole('link', { name: 'Оферта' })).toBeVisible()
        await expect(
            page.getByRole('link', { name: 'Конфиденциальность' })
        ).toBeVisible()
    })

    test('«Войти» в шапке открывает вход по ссылке', async ({ page }) => {
        const header = page.getByRole('banner')
        await header.getByRole('link', { name: 'Войти' }).click()

        await expect(page).toHaveURL(/\/auth$/, { timeout: 10000 })
        await expect(
            page.getByRole('button', { name: /получить ссылку для входа/i })
        ).toBeVisible({ timeout: 10000 })
    })

    // Задача 9, найдено первым ревью: параметр ?mode=register раньше никто
    // не читал — «Регистрация» вела на тот же экран входа по ссылке, что и
    // «Войти». Второе ревью отменило первый ответ на это (открывать форму
    // пароля): регистрации по ссылке отдельной нет — человек просто вводит
    // почту, и сервер сам решает, завести аккаунт или впустить в
    // существующий. Экран обязан только назвать, зачем он открыт — текстом,
    // не переключением на другую форму.
    test('«Регистрация» в шапке открывает форму по ссылке с намерением "регистрация"', async ({
        page,
    }) => {
        const header = page.getByRole('banner')
        await header.getByRole('link', { name: 'Регистрация' }).click()

        await expect(page).toHaveURL(/\/auth\?mode=register/, { timeout: 10000 })

        await expect(
            page.getByRole('heading', { name: 'Регистрация', level: 2 })
        ).toBeVisible({ timeout: 10000 })
        await expect(
            page.getByRole('button', { name: 'Получить ссылку для регистрации' })
        ).toBeVisible()
        // Обещание предложения: пароль не обязателен.
        await expect(page.getByText(/пароль заводить не обязательно/i)).toBeVisible()

        // Не «скрыт, но в DOM» — текста входа здесь нет вовсе: `intent`
        // выбирает, какая подпись рендерится, а не какая из двух видна.
        // toHaveCount(0), а не not.toBeVisible() — последний проходит
        // одинаково и для скрытого элемента, и для отсутствующего, и не
        // отличает одно от другого.
        await expect(page.getByText('Получить ссылку для входа')).toHaveCount(0)
    })

    test('«Регистрация» в блоке перед подвалом тоже открывает форму с намерением "регистрация"', async ({
        page,
    }) => {
        const cta = page.getByTestId('landing-cta')
        await cta.getByRole('link', { name: /регистрац/i }).click()

        await expect(page).toHaveURL(/\/auth\?mode=register/, { timeout: 10000 })
        await expect(
            page.getByRole('heading', { name: 'Регистрация', level: 2 })
        ).toBeVisible({ timeout: 10000 })
        await expect(
            page.getByRole('button', { name: 'Получить ссылку для регистрации' })
        ).toBeVisible()
    })

    // Пароль остаётся вторым способом, доступным без перезагрузки, даже с
    // намерением "регистрация" (задача 7) — и в register-варианте пароль-формы
    // главной обязана быть «Зарегистрироваться»: кнопки «Войти» там больше
    // нет вовсе (второе ревью — раньше она оживала первой и вела к ошибке
    // входа для человека, у которого ещё нет пароля).
    test('«Войти по паролю» из намерения "регистрация" не предлагает кнопку «Войти»', async ({
        page,
    }) => {
        const header = page.getByRole('banner')
        await header.getByRole('link', { name: 'Регистрация' }).click()
        await expect(page).toHaveURL(/\/auth\?mode=register/, { timeout: 10000 })

        await page.getByRole('button', { name: /войти по паролю/i }).click()

        await expect(
            page.getByRole('button', { name: 'Зарегистрироваться' })
        ).toBeVisible({ timeout: 10000 })
        // exact: true — иначе подстрокой совпадёт «Войти по ссылке», которая
        // здесь есть всегда (переключает обратно на форму по ссылке).
        await expect(
            page.getByRole('button', { name: 'Войти', exact: true })
        ).toHaveCount(0)
    })
})
