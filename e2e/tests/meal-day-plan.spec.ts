import type { APIRequestContext, Browser, BrowserContext, Page } from '@playwright/test'

import { test, expect, signIn, asUser } from '../fixtures/session'
import { freshAddress } from '../fixtures/mail'

/**
 * План питания на день (meal-day-plan, задача 5.1).
 *
 * Команда заводит одобренные рецепты на все приёмы пищи → клиент открывает
 * «Меню» → видит план с блюдами и процентами → закрепляет обед, пересобирает,
 * обед на месте → задаёт вес вручную, итоги пересчитаны → заменяет ужин
 * альтернативой.
 *
 * Клиент — свежая учётная запись: план строится только под посчитанную
 * норму, а засеянной клиентской учётке профиль не заполняют (на её пустоту
 * опирается nutrition-target-honesty). Адрес от `freshAddress` попадает под
 * шаблоны зачистки стенда, а вместе с учёткой уходят и её планы. Удалить
 * рецепт API не умеет: после прогона рецепты снимаются с публикации.
 */

test.use({ role: undefined })
test.describe.configure({ mode: 'serial' })

const PASSWORD = 'E2eStand!2026'
// Метка времени: повторный прогон на той же базе не путает свои рецепты с прошлыми.
const STAMP = Date.now()

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'

interface RecipeSpec {
    name: string
    meal_types: MealType[]
    yield_grams: number
    ingredients: { food: string; grams: number }[]
}

// Два блюда подходят и к обеду, и к ужину, третье — только к ужину: у ужина
// всегда есть, на что его заменить.
const RECIPES: RecipeSpec[] = [
    {
        name: `E2E овсянка с творогом ${STAMP}`,
        meal_types: ['breakfast'],
        yield_grams: 300,
        ingredients: [
            { food: 'Овсянка', grams: 100 },
            { food: 'Творог', grams: 200 },
        ],
    },
    {
        name: `E2E гречка с курицей ${STAMP}`,
        meal_types: ['lunch', 'dinner'],
        yield_grams: 500,
        ingredients: [
            { food: 'Гречка', grams: 120 },
            { food: 'Куриная грудка', grams: 250 },
        ],
    },
    {
        name: `E2E курица с яблоками ${STAMP}`,
        meal_types: ['lunch', 'dinner'],
        yield_grams: 450,
        ingredients: [
            { food: 'Куриная грудка', grams: 300 },
            { food: 'Яблоко', grams: 200 },
        ],
    },
    {
        name: `E2E творог с гречкой ${STAMP}`,
        meal_types: ['dinner'],
        yield_grams: 330,
        ingredients: [
            { food: 'Творог', grams: 250 },
            { food: 'Гречка', grams: 80 },
        ],
    },
    {
        name: `E2E яблоко с творогом ${STAMP}`,
        meal_types: ['snack', 'breakfast'],
        yield_grams: 300,
        ingredients: [
            { food: 'Яблоко', grams: 200 },
            { food: 'Творог', grams: 100 },
        ],
    },
]

interface Session {
    context: BrowserContext
    token: string
}

async function sessionAs(browser: Browser, baseURL: string, role: string): Promise<Session> {
    const context = await browser.newContext({ baseURL })
    const token = await signIn(context, baseURL, role)
    return { context, token }
}

/** Полоса про cookie лежит над нижними кнопками; отвечаем, если она есть. */
async function dismissCookieBanner(page: Page) {
    const banner = page.getByLabel('Аналитические cookie')
    if (await banner.isVisible().catch(() => false)) {
        await banner.getByRole('button', { name: 'Отказаться' }).click()
        await expect(banner).toBeHidden()
    }
}

/** Продукт каталога по началу названия: seed-e2e кладёт его в пустой каталог. */
async function foodId(request: APIRequestContext, token: string, name: string): Promise<string | number> {
    const response = await request.get(`/api/v1/admin/recipes/catalogue-search?q=${encodeURIComponent(name)}`, {
        headers: asUser(token),
    })
    expect(response.ok(), await response.text()).toBeTruthy()
    const items = (await response.json()).data.items as Array<{ food_id: string | number; name: string }>
    const found = items.find((item) => item.name.startsWith(name)) ?? items[0]
    expect(found, `в каталоге нет «${name}» — прогнан ли seed-e2e?`).toBeTruthy()
    return found.food_id
}

/** Местная дата `YYYY-MM-DD` — та же, что считает сегодняшней страница. */
function localToday(): string {
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

const recipeIds: string[] = []
let admin: Session | null = null

test.afterAll(async () => {
    if (admin) {
        for (const id of recipeIds) {
            const response = await admin.context.request.post(`/api/v1/admin/recipes/${id}/unpublish`, {
                headers: asUser(admin.token),
            })
            expect(response.ok(), `снять рецепт ${id} с публикации не удалось: ${await response.text()}`).toBeTruthy()
        }
    }
    await admin?.context.close()
})

test('план дня: проценты, закрепление, ручной вес и замена', async ({ browser, baseURL, page, context }) => {
    test.setTimeout(180_000)

    // --- Команда создаёт и отправляет, куратор одобряет — через API -----------
    admin = await sessionAs(browser, baseURL!, 'admin')
    const adminHeaders = asUser(admin.token)
    const foods = new Map<string, string | number>()
    for (const name of new Set(RECIPES.flatMap((recipe) => recipe.ingredients.map((i) => i.food)))) {
        foods.set(name, await foodId(admin.context.request, admin.token, name))
    }

    const curator = await sessionAs(browser, baseURL!, 'curator')
    try {
        for (const recipe of RECIPES) {
            const created = await admin.context.request.post('/api/v1/admin/recipes', {
                headers: adminHeaders,
                data: {
                    name: recipe.name,
                    description: 'Рецепт прогона E2E',
                    photo_key: null,
                    cook_minutes: 20,
                    complexity: 'easy',
                    servings: 1,
                    yield_grams: recipe.yield_grams,
                    meal_types: recipe.meal_types,
                    tags: [],
                    allergens: [],
                    ingredients: recipe.ingredients.map((ingredient) => ({
                        food_id: foods.get(ingredient.food),
                        grams: ingredient.grams,
                        display_quantity: null,
                        to_taste: false,
                    })),
                    steps: [{ text: 'Приготовить', photo_key: null }],
                },
            })
            expect(created.status(), await created.text()).toBe(201)
            const id = (await created.json()).data.recipe.id as string
            recipeIds.push(id)

            const submitted = await admin.context.request.post(`/api/v1/admin/recipes/${id}/submit`, {
                headers: adminHeaders,
            })
            expect(submitted.ok(), await submitted.text()).toBeTruthy()

            const approved = await curator.context.request.post(`/api/v1/curator/recipes/${id}/approve`, {
                headers: asUser(curator.token),
                data: {},
            })
            expect(approved.ok(), await approved.text()).toBeTruthy()
        }
    } finally {
        await curator.context.close()
    }

    // --- Свежий клиент с посчитанной нормой ----------------------------------
    const registered = await context.request.post(`${baseURL}/api/v1/auth/register`, {
        data: {
            email: freshAddress(),
            password: PASSWORD,
            name: 'Проверка плана',
            consents: { terms_of_service: true, privacy_policy: true, data_processing: true, marketing: false },
        },
    })
    expect(registered.status(), await registered.text()).toBe(201)
    const token = (await registered.json())?.data?.token as string
    expect(token, 'регистрация не вернула токен').toBeTruthy()

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
    const weight = await context.request.post(`${baseURL}/api/v1/dashboard/daily`, {
        headers: asUser(token),
        data: { date: localToday(), metric: { type: 'weight', data: { weight: 75.5 } } },
    })
    expect(weight.ok(), await weight.text()).toBeTruthy()

    // --- «Меню» открывается на плане сегодняшнего дня ------------------------
    await page.goto('/menu')
    await expect(page.getByRole('heading', { level: 1, name: 'Меню' })).toBeVisible({ timeout: 15000 })
    await dismissCookieBanner(page)
    // Бета: заметка о бесплатном доступе и будущей подписке, ссылка в чат.
    const beta = page.getByRole('complementary', { name: /Бета-версия/ })
    await expect(beta).toContainText('пока он бесплатный для всех')
    await expect(beta).toContainText('платную подписку')
    await expect(beta.getByRole('link', { name: 'Написать в чат' })).toHaveAttribute('href', '/chat')
    await expect(page.getByRole('tab', { name: 'План' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('plan-date')).toContainText('Сегодня', { timeout: 15000 })

    const kcalTotals = page.getByTestId('plan-totals-kcal')
    await expect(kcalTotals).toContainText('% цели', { timeout: 20000 })
    await expect(page.getByTestId('plan-totals-protein')).toContainText('% цели')

    const slot = (meal: string) => page.getByRole('article', { name: meal, exact: true })
    for (const meal of ['Завтрак', 'Обед', 'Ужин', 'Перекус']) {
        await expect(slot(meal).getByRole('link')).toBeVisible()
    }
    await expect(slot('Обед')).toContainText('% калорий дня')

    // --- Закрепить обед и пересобрать: обед на месте --------------------------
    const lunchName = (await slot('Обед').getByRole('link').textContent())!.trim()
    await slot('Обед').getByRole('button', { name: `Закрепить «${lunchName}»` }).click()
    await expect(slot('Обед').getByRole('button', { name: `Открепить «${lunchName}»` })).toBeVisible({
        timeout: 15000,
    })

    await page.getByRole('button', { name: 'Пересобрать' }).last().click()
    await expect(page.getByText('План пересобран')).toBeVisible({ timeout: 15000 })
    await expect(slot('Обед').getByRole('link')).toHaveText(lunchName)
    await expect(slot('Обед').getByRole('button', { name: `Открепить «${lunchName}»` })).toBeVisible()

    // --- Ручной вес завтрака: итоги пересчитаны -------------------------------
    const kcalBefore = (await kcalTotals.textContent())!
    const breakfastName = (await slot('Завтрак').getByRole('link').textContent())!.trim()
    const gramsField = slot('Завтрак').getByLabel(`Вес блюда «${breakfastName}», г`)
    const gramsBefore = Number(await gramsField.inputValue())
    const gramsAfter = gramsBefore >= 300 ? gramsBefore - 120 : gramsBefore + 120
    await gramsField.fill(String(gramsAfter))
    await slot('Завтрак').getByRole('button', { name: 'Применить' }).click()

    await expect(slot('Завтрак').getByText('Вес задан вручную')).toBeVisible({ timeout: 15000 })
    await expect(slot('Завтрак').getByLabel(`Вес блюда «${breakfastName}», г`)).toHaveValue(String(gramsAfter))
    await expect(kcalTotals).not.toHaveText(kcalBefore)

    // --- Заменить ужин альтернативой ------------------------------------------
    const dinnerName = (await slot('Ужин').getByRole('link').textContent())!.trim()
    await slot('Ужин').getByRole('button', { name: `Заменить «${dinnerName}»` }).click()
    const sheet = page.getByRole('dialog', { name: 'Заменить: Ужин' })
    await expect(sheet).toBeVisible()
    const choose = sheet.getByRole('button', { name: /^Выбрать «/ }).first()
    await expect(choose).toBeVisible({ timeout: 15000 })
    await expect(sheet).toContainText('День:')
    const chosenName = ((await choose.getAttribute('aria-label')) ?? '').replace(/^Выбрать «|»$/g, '')
    expect(chosenName).not.toBe(dinnerName)
    await choose.click()

    await expect(sheet).toBeHidden({ timeout: 15000 })
    await expect(slot('Ужин').getByRole('link')).toHaveText(chosenName)
    // Закрепление обеда пережило и правку веса, и замену.
    await expect(slot('Обед').getByRole('link')).toHaveText(lunchName)
})
