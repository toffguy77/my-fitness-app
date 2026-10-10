import type { APIRequestContext, Browser, BrowserContext, Page } from '@playwright/test'

import { test, expect, signIn, asUser } from '../fixtures/session'
import { freshAddress } from '../fixtures/mail'

/**
 * Список покупок (shopping-list, задача 4.1).
 *
 * Команда заводит два обеденных рецепта с общим продуктом (куриная грудка),
 * куратор одобряет → свежий клиент с посчитанной нормой получает планы на
 * сегодня и завтра (обед — по рецепту на каждый день) → список за оба дня
 * показывает курицу одной строкой с суммой → отметка «купил» переживает
 * перезагрузку → «Скопировать» кладёт в буфер текст без отмеченной строки.
 *
 * Сумма считается здесь же из ответа плана: вес обеда подбирает сервер, а
 * курица в блюде — доля от веса готового блюда.
 *
 * Клиент — свежая учётная запись от `freshAddress` (под шаблонами зачистки
 * стенда, планы уходят вместе с ней). Рецепты после прогона снимаются с
 * публикации: удалить их API не умеет.
 */

test.use({ role: undefined, permissions: ['clipboard-read', 'clipboard-write'] })
test.describe.configure({ mode: 'serial' })

const PASSWORD = 'E2eStand!2026'
const STAMP = Date.now()

interface RecipeSpec {
    name: string
    yield_grams: number
    ingredients: { food: string; grams: number }[]
}

const CHICKEN = 'Куриная грудка'
const BUCKWHEAT = 'Гречка'

const DAY_ONE: RecipeSpec = {
    name: `E2E список: гречка с курицей ${STAMP}`,
    yield_grams: 500,
    ingredients: [
        { food: BUCKWHEAT, grams: 120 },
        { food: CHICKEN, grams: 250 },
    ],
}
const DAY_TWO: RecipeSpec = {
    name: `E2E список: курица с яблоками ${STAMP}`,
    yield_grams: 450,
    ingredients: [
        { food: CHICKEN, grams: 300 },
        { food: 'Яблоко', grams: 200 },
    ],
}

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

interface CatalogueFood {
    food_id: string | number
    name: string
}

/** Продукт каталога по началу названия: seed-e2e кладёт его в пустой каталог. */
async function catalogueFood(request: APIRequestContext, token: string, name: string): Promise<CatalogueFood> {
    const response = await request.get(`/api/v1/admin/recipes/catalogue-search?q=${encodeURIComponent(name)}`, {
        headers: asUser(token),
    })
    expect(response.ok(), await response.text()).toBeTruthy()
    const items = (await response.json()).data.items as CatalogueFood[]
    const found = items.find((item) => item.name.startsWith(name)) ?? items[0]
    expect(found, `в каталоге нет «${name}» — прогнан ли seed-e2e?`).toBeTruthy()
    return found
}

function localDate(offsetDays: number): string {
    const d = new Date()
    d.setDate(d.getDate() + offsetDays)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Округление списка: вверх до 10 г, свыше 500 г — до 50 г. */
function roundUp(grams: number): number {
    const step = grams > 500 ? 50 : 10
    return Math.ceil(grams / step - 1e-6) * step
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

test('список покупок за два дня: сумма, отметка, копирование', async ({ browser, baseURL, page, context }) => {
    test.setTimeout(180_000)

    // --- Рецепты: команда создаёт и отправляет, куратор одобряет --------------
    admin = await sessionAs(browser, baseURL!, 'admin')
    const adminHeaders = asUser(admin.token)
    const foods = new Map<string, CatalogueFood>()
    for (const name of [CHICKEN, BUCKWHEAT, 'Яблоко']) {
        foods.set(name, await catalogueFood(admin.context.request, admin.token, name))
    }

    const curator = await sessionAs(browser, baseURL!, 'curator')
    try {
        for (const recipe of [DAY_ONE, DAY_TWO]) {
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
                    meal_types: ['lunch'],
                    tags: [],
                    allergens: [],
                    ingredients: recipe.ingredients.map((ingredient) => ({
                        food_id: foods.get(ingredient.food)!.food_id,
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

    // --- Свежий клиент с посчитанной нормой, в плане только обед -------------
    const registered = await context.request.post(`${baseURL}/api/v1/auth/register`, {
        data: {
            email: freshAddress(),
            password: PASSWORD,
            name: 'Проверка списка покупок',
            consents: { terms_of_service: true, privacy_policy: true, data_processing: true, marketing: false },
        },
    })
    expect(registered.status(), await registered.text()).toBe(201)
    const token = (await registered.json())?.data?.token as string
    expect(token, 'регистрация не вернула токен').toBeTruthy()
    const headers = asUser(token)

    const settings = await context.request.put(`${baseURL}/api/v1/users/settings`, {
        headers,
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
        headers,
        data: { date: localDate(0), metric: { type: 'weight', data: { weight: 75.5 } } },
    })
    expect(weight.ok(), await weight.text()).toBeTruthy()
    const meals = await context.request.put(`${baseURL}/api/v1/meal-plan-settings`, {
        headers,
        data: { meal_types: ['lunch'] },
    })
    expect(meals.ok(), await meals.text()).toBeTruthy()

    // --- Планы на сегодня и завтра: обед — наш рецепт на каждый день ---------
    let chickenGrams = 0
    for (const [offset, recipe, id] of [
        [0, DAY_ONE, () => recipeIds[0]],
        [1, DAY_TWO, () => recipeIds[1]],
    ] as const) {
        const date = localDate(offset)
        const opened = await context.request.get(`${baseURL}/api/v1/meal-plans/${date}`, { headers })
        expect(opened.ok(), await opened.text()).toBeTruthy()
        const replaced = await context.request.put(`${baseURL}/api/v1/meal-plans/${date}/items/lunch`, {
            headers,
            data: { recipe_id: id() },
        })
        expect(replaced.ok(), await replaced.text()).toBeTruthy()
        const lunch = ((await replaced.json()).data.items as Array<{ meal_type: string; recipe_id: string; grams: number }>)
            .find((item) => item.meal_type === 'lunch')
        expect(lunch?.recipe_id).toBe(id())
        const chicken = recipe.ingredients.find((ingredient) => ingredient.food === CHICKEN)!.grams
        chickenGrams += (chicken * lunch!.grams) / recipe.yield_grams
    }
    const expectedChicken = `${roundUp(chickenGrams)} г`

    // --- Список за оба дня: курица одной строкой с суммой --------------------
    await page.goto('/menu/shopping')
    await expect(page.getByRole('heading', { level: 1, name: 'Список покупок' })).toBeVisible({ timeout: 15000 })
    await dismissCookieBanner(page)
    await expect(page.getByRole('textbox', { name: 'С', exact: true })).toHaveValue(localDate(0), { timeout: 15000 })
    await expect(page.getByRole('textbox', { name: 'По', exact: true })).toHaveValue(localDate(1))

    const chickenName = foods.get(CHICKEN)!.name
    const rows = page.locator('[data-testid^="shopping-item-"]')
    const chickenRow = rows.filter({ hasText: chickenName })
    await expect(chickenRow).toHaveCount(1, { timeout: 15000 })
    await expect(chickenRow).toContainText(expectedChicken)

    // --- Отметка «купил» переживает перезагрузку ------------------------------
    await chickenRow.getByRole('button', { name: `«${chickenName}» куплено` }).click()
    await expect(chickenRow).toHaveAttribute('data-mark', 'bought')
    await page.reload()
    await expect(rows.filter({ hasText: chickenName })).toHaveAttribute('data-mark', 'bought', { timeout: 15000 })

    // --- «Скопировать»: текст списка в буфере, без отмеченной строки ---------
    await page.getByRole('button', { name: 'Скопировать' }).click()
    await expect(page.getByText('Список скопирован')).toBeVisible({ timeout: 10000 })
    const text = await page.evaluate(() => navigator.clipboard.readText())
    expect(text.startsWith('Список покупок · ')).toBe(true)
    expect(text).toContain(`— ${foods.get(BUCKWHEAT)!.name} — `)
    expect(text).not.toContain(chickenName)
})
