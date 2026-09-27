import { test, expect, asUser } from '../fixtures/session'
import { freshAddress } from '../fixtures/mail'

/**
 * Норма КБЖУ показывается только если посчитана.
 *
 * Стоит вместо ручной проверки «пройти путь от пустого профиля до посчитанной
 * нормы». Человеку с незаполненным профилем показывали 2000 ккал и 150 г белка
 * как его личную норму, и от этого числа считались проценты выполнения, цвет
 * калорий и алерты куратору. На проде такую норму видели 16 клиентов из 18 —
 * то есть это было обычным состоянием, а не краем.
 *
 * Свежая учётная запись — и есть пустой профиль: ни пола, ни роста, ни веса.
 * Адрес от `freshAddress` попадает под шаблоны зачистки стенда.
 */

test.use({ role: undefined })

const PASSWORD = 'E2eStand!2026'

test.describe('норма КБЖУ', () => {
    test('свежая учётная запись не получает придуманной нормы', async ({
        page,
        context,
        baseURL,
    }) => {
        const address = freshAddress()
        const registered = await context.request.post(`${baseURL}/api/v1/auth/register`, {
            data: {
                email: address,
                password: PASSWORD,
                name: 'Проверка нормы',
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
        expect(token, 'регистрация не вернула токен').toBeTruthy()

        // Сервер обязан сказать, что считать не из чего, и назвать недостающее:
        // кнопка «Посчитать норму» ведёт по адресу, а не в общие настройки.
        const targets = await context.request.get(`${baseURL}/api/v1/nutrition-calc/targets`, {
            headers: asUser(token),
        })
        expect(targets.ok(), await targets.text()).toBeTruthy()
        const answer = (await targets.json()).data
        expect(answer.targets, 'у пустого профиля норма посчитаться не может').toBeNull()
        expect(answer.missing, 'сервер не сказал, чего не хватает').toMatchObject({
            profile: true,
            weight: true,
        })

        await page.goto('/food-tracker')

        // Придуманных чисел нет ни в каком виде.
        await expect(page.getByText('Норма не посчитана')).toBeVisible({ timeout: 20000 })
        await expect(page.getByText(/2000/)).toHaveCount(0)
        await expect(page.getByText(/150 г|150г/)).toHaveCount(0)

        // Вместо нормы — действие, и оно ведёт туда, где недостающее заполняют.
        const action = page.getByRole('link', { name: 'Посчитать норму' })
        await expect(action).toBeVisible()
        await expect(action).toHaveAttribute('href', '/settings/body')
    })

    test('дашборд свежей учётной записи тоже без придуманной нормы', async ({
        page,
        context,
        baseURL,
    }) => {
        const address = freshAddress()
        const registered = await context.request.post(`${baseURL}/api/v1/auth/register`, {
            data: {
                email: address,
                password: PASSWORD,
                name: 'Проверка нормы',
                consents: {
                    terms_of_service: true,
                    privacy_policy: true,
                    data_processing: true,
                    marketing: false,
                },
            },
        })
        expect(registered.status(), await registered.text()).toBe(201)

        await page.goto('/dashboard')

        await expect(page.getByText('Норма не посчитана')).toBeVisible({ timeout: 20000 })
        // Раньше здесь стояло «из 2000 ккал», а в трекере углеводов 200 против
        // 250 — одна и та же «норма» на двух экранах разная.
        await expect(page.getByText(/из 2000 ккал/)).toHaveCount(0)
    })

    test('норма появляется, как только её стало из чего посчитать', async ({
        page,
        context,
        baseURL,
    }) => {
        // Проверка заводит собственную учётную запись и сама заполняет
        // недостающее. Засеянная клиентская учётка стенда профиля не имеет —
        // первая версия этой проверки опиралась на то, что он у неё есть, и
        // упала на `targets: null`, который для такой учётки как раз верен.
        const address = freshAddress()
        const registered = await context.request.post(`${baseURL}/api/v1/auth/register`, {
            data: {
                email: address,
                password: PASSWORD,
                name: 'Проверка нормы',
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

        await page.goto('/food-tracker')
        await expect(page.getByText('Норма не посчитана')).toBeVisible({ timeout: 20000 })

        // Пол, дата рождения и рост — «Тело и цели».
        const settings = await context.request.put(`${baseURL}/api/v1/users/settings`, {
            headers: asUser(token),
            data: {
                birth_date: '1990-05-17',
                biological_sex: 'male',
                height: 180,
                activity_level: 'moderate',
                fitness_goal: 'maintain',
            },
        })
        expect(settings.ok(), await settings.text()).toBeTruthy()

        // Пока веса нет, считать всё ещё не из чего — и сервер обязан сказать
        // именно про вес, потому что кнопка ведёт по адресу.
        const halfway = await context.request.get(`${baseURL}/api/v1/nutrition-calc/targets`, {
            headers: asUser(token),
        })
        const halfwayAnswer = (await halfway.json()).data
        expect(halfwayAnswer.targets).toBeNull()
        expect(halfwayAnswer.missing).toMatchObject({ profile: false, weight: true })

        const today = new Date().toISOString().slice(0, 10)
        const weight = await context.request.post(`${baseURL}/api/v1/dashboard/daily`, {
            headers: asUser(token),
            data: { date: today, metric: { type: 'weight', data: { weight: 75.5 } } },
        })
        expect(weight.ok(), await weight.text()).toBeTruthy()

        const targets = await context.request.get(`${baseURL}/api/v1/nutrition-calc/targets`, {
            headers: asUser(token),
        })
        const answer = (await targets.json()).data
        const calories = answer?.calories ?? answer?.targets?.calories
        expect(calories, 'всех данных достаточно — норма обязана посчитаться').toBeTruthy()
        expect(calories, 'посчитанная норма не должна совпасть с прежним придуманным числом').not.toBe(
            2000,
        )

        await page.goto('/food-tracker')
        await expect(page.getByText('Норма не посчитана')).toHaveCount(0)
        await expect(page.getByText(String(Math.round(calories))).first()).toBeVisible({
            timeout: 20000,
        })
    })
})
