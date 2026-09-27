import { test, expect, signIn, asUser } from '../fixtures/session'
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

    test('у профиля с данными показывается посчитанная норма, а не круглое число', async ({
        page,
        context,
        baseURL,
    }) => {
        const token = await signIn(context, baseURL!, 'client')

        const targets = await context.request.get(`${baseURL}/api/v1/nutrition-calc/targets`, {
            headers: asUser(token),
        })
        const answer = (await targets.json()).data
        const calories = answer?.calories ?? answer?.targets?.calories
        expect(calories, 'у заполненного профиля норма обязана считаться').toBeTruthy()

        await page.goto('/food-tracker')
        await expect(page.getByText('Норма не посчитана')).toHaveCount(0)

        // Показано именно посчитанное значение. Округление — как на экране.
        await expect(page.getByText(String(Math.round(calories))).first()).toBeVisible({
            timeout: 20000,
        })
    })
})
