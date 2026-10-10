import type { APIRequestContext, Browser, BrowserContext, Page } from '@playwright/test'

import { test, expect, signIn, asUser } from '../fixtures/session'
import { freshAddress } from '../fixtures/mail'
import { FoodTrackerPage } from '../pages/food-tracker.page'

/**
 * План и дневник (plan-diary-logging, задача 6.1).
 *
 * План с блюдами → «Съел» у обеда → в дневнике в обеде запись весом плана →
 * под ужином «По плану» → «+» → запись → удаление обеда из дневника → в плане
 * обед снова несъеденный → поиск дневника находит рецепт с пометкой «рецепт».
 *
 * Как и в meal-day-plan.spec.ts: рецепты заводит и одобряет команда через API,
 * клиент — свежая учётка с посчитанной нормой (адрес `freshAddress` попадает под
 * зачистку стенда вместе с планами и записями). После прогона рецепты снимаются
 * с публикации — удалить рецепт API не умеет.
 */

test.use({ role: undefined })
test.describe.configure({ mode: 'serial' })

const PASSWORD = 'E2eStand!2026'
const STAMP = Date.now()

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'

interface RecipeSpec {
    name: string
    meal_types: MealType[]
    yield_grams: number
    ingredients: { food: string; grams: number }[]
}

// По одному блюду на обед и ужин: план не может выбрать другое, и поиск
// дневника ищет ровно то, что стоит в обеде плана.
const LUNCH = `E2E дневник гречка с курицей ${STAMP}`
const DINNER = `E2E дневник творог с гречкой ${STAMP}`
const RECIPES: RecipeSpec[] = [
    {
        name: `E2E дневник овсянка ${STAMP}`,
        meal_types: ['breakfast', 'snack'],
        yield_grams: 300,
        ingredients: [
            { food: 'Овсянка', grams: 100 },
            { food: 'Творог', grams: 200 },
        ],
    },
    {
        name: LUNCH,
        meal_types: ['lunch'],
        yield_grams: 500,
        ingredients: [
            { food: 'Гречка', grams: 120 },
            { food: 'Куриная грудка', grams: 250 },
        ],
    },
    {
        name: DINNER,
        meal_types: ['dinner'],
        yield_grams: 330,
        ingredients: [
            { food: 'Творог', grams: 250 },
            { food: 'Гречка', grams: 80 },
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

async function dismissCookieBanner(page: Page) {
    const banner = page.getByLabel('Аналитические cookie')
    if (await banner.isVisible().catch(() => false)) {
        await banner.getByRole('button', { name: 'Отказаться' }).click()
        await expect(banner).toBeHidden()
    }
}

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

test('план и дневник: «Съел», «По плану», удаление, рецепт в поиске', async ({ browser, baseURL, page, context }) => {
    test.setTimeout(180_000)

    // --- Рецепты: команда создаёт, куратор одобряет -------------------------
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
            name: 'Проверка дневника',
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

    // --- План: «Съел» у обеда ------------------------------------------------
    await page.goto('/menu')
    await expect(page.getByRole('heading', { level: 1, name: 'Меню' })).toBeVisible({ timeout: 15000 })
    await dismissCookieBanner(page)
    await expect(page.getByTestId('plan-totals-kcal')).toContainText('% цели', { timeout: 20000 })

    const slot = (meal: string) => page.getByRole('article', { name: meal, exact: true })
    await expect(slot('Обед').getByRole('link')).toHaveText(LUNCH)
    await expect(slot('Ужин').getByRole('link')).toHaveText(DINNER)
    const lunchGrams = Number(await slot('Обед').getByLabel(`Вес блюда «${LUNCH}», г`).inputValue())
    const dinnerGrams = Number(await slot('Ужин').getByLabel(`Вес блюда «${DINNER}», г`).inputValue())
    expect(lunchGrams).toBeGreaterThan(0)

    await slot('Обед')
        .getByRole('button', { name: `Съел «${LUNCH}», ${lunchGrams} г — записать в дневник` })
        .click()
    await expect(page.getByTestId('plan-item-lunch-eaten')).toHaveText('Съедено', { timeout: 15000 })
    await expect(slot('Обед')).toContainText(`съедено ${lunchGrams} г`)
    await expect(slot('Обед').getByRole('button', { name: `Заменить «${LUNCH}»` })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Подогнать остаток' })).toBeVisible()

    // --- Дневник: обед записан весом плана, ужин — «По плану» -----------------
    const diary = new FoodTrackerPage(page)
    await diary.goto()
    await diary.expectLoaded()

    const lunchSlot = diary.mealSlot('Обед')
    await expect(lunchSlot.getByLabel(new RegExp(`^${LUNCH}, ${lunchGrams} г`))).toBeVisible({ timeout: 15000 })
    // Съеденное не дублируется под «По плану».
    await expect(lunchSlot.getByTestId('planned-block')).toHaveCount(0)

    const dinnerSlot = diary.mealSlot('Ужин')
    const planned = dinnerSlot.getByTestId('planned-block')
    await expect(planned).toContainText('По плану', { timeout: 15000 })
    await expect(planned).toContainText(DINNER)
    await planned.getByRole('button', { name: `Записать «${DINNER}», ${dinnerGrams} г, в Ужин` }).click()

    await expect(dinnerSlot.getByLabel(new RegExp(`^${DINNER}, ${dinnerGrams} г`))).toBeVisible({ timeout: 15000 })
    await expect(dinnerSlot.getByTestId('planned-block')).toHaveCount(0)

    // --- Удаление обеда из дневника возвращает его в план ---------------------
    await lunchSlot.getByLabel(new RegExp(`^${LUNCH}, `)).hover()
    await lunchSlot.getByRole('button', { name: `Удалить ${LUNCH}` }).click({ force: true })
    await expect(page.getByText('Запись удалена')).toBeVisible({ timeout: 10000 })
    await expect(lunchSlot.getByTestId('planned-block')).toContainText(LUNCH, { timeout: 15000 })

    await page.goto('/menu')
    await expect(slot('Обед').getByRole('link')).toHaveText(LUNCH, { timeout: 20000 })
    await expect(page.getByTestId('plan-item-lunch-eaten')).toHaveCount(0)
    await expect(slot('Обед').getByRole('button', { name: new RegExp(`^Съел «${LUNCH}»`) })).toBeVisible()
    // Ужин записан из дневника — в плане он съеденный.
    await expect(page.getByTestId('plan-item-dinner-eaten')).toBeVisible()

    // --- Поиск дневника находит рецепт с пометкой ----------------------------
    await diary.goto()
    await diary.expectLoaded()
    await diary.openAddFoodForMeal('Перекус')
    await diary.searchFood(LUNCH)
    const option = diary.foodList.getByRole('option', { name: new RegExp(LUNCH) })
    await expect(option).toBeVisible()
    await expect(option.getByText('рецепт', { exact: true })).toBeVisible()
    await expect(option.getByRole('link', { name: `Открыть рецепт «${LUNCH}»` })).toHaveAttribute(
        'href',
        `/menu/recipes/${recipeIds[1]}`
    )
})
