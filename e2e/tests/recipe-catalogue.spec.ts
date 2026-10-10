import type { Browser, BrowserContext, Page } from '@playwright/test'

import { test, expect, signIn, asUser } from '../fixtures/session'

/**
 * Путь рецепта от команды до клиента (recipe-catalogue, задача 8.1).
 *
 * Команда создаёт рецепт из продукта каталога и отправляет на проверку →
 * куратор одобряет его на экране → клиент находит его в «Меню», открывает,
 * нажимает «Не предлагать это блюдо» → блюда в меню больше нет → клиент
 * возвращает его в «Ограничениях в питании» → блюдо снова в меню.
 *
 * Каждая роль — своим контекстом и своим входом: одна сессия на всех была бы
 * повтором ротируемого токена (см. fixtures/session.ts). Удалить рецепт API
 * не умеет, поэтому после прогона он снимается с публикации и клиенту больше
 * не виден; отклонение клиента снимается тоже, даже если тест упал посередине.
 */

test.describe.configure({ mode: 'serial' })

// Имя с меткой времени: повторный прогон на той же базе не путает свой рецепт
// с прошлым, снятым с публикации.
const RECIPE_NAME = `E2E сырники ${Date.now()}`

interface Session {
    context: BrowserContext
    page: Page
    token: string
}

async function sessionAs(browser: Browser, baseURL: string, role: string): Promise<Session> {
    const context = await browser.newContext({ baseURL })
    const token = await signIn(context, baseURL, role)
    const page = await context.newPage()
    return { context, page, token }
}

/** Полоса про cookie лежит над нижними кнопками; отвечаем, если она есть. */
async function dismissCookieBanner(page: Page) {
    const banner = page.getByLabel('Аналитические cookie')
    if (await banner.isVisible().catch(() => false)) {
        await banner.getByRole('button', { name: 'Отказаться' }).click()
        await expect(banner).toBeHidden()
    }
}

async function searchMenu(page: Page, name: string) {
    // «Меню» открывается на плане дня; каталог — вкладка «Рецепты».
    await page.goto('/menu?tab=recipes')
    await expect(page.getByRole('heading', { level: 1, name: 'Меню' })).toBeVisible({ timeout: 15000 })
    await dismissCookieBanner(page)
    await page.getByLabel('Поиск рецептов').fill(name)
}

let recipeId: string | null = null
let admin: Session | null = null
let client: Session | null = null

test.afterAll(async () => {
    if (recipeId && client) {
        // 204 или 404 — оба значат «отклонения больше нет».
        await client.context.request.delete(`/api/v1/recipes/${recipeId}/reject`, {
            headers: asUser(client.token),
        })
    }
    if (recipeId && admin) {
        const response = await admin.context.request.post(`/api/v1/admin/recipes/${recipeId}/unpublish`, {
            headers: asUser(admin.token),
        })
        expect(response.ok(), `снять рецепт с публикации не удалось: ${await response.text()}`).toBeTruthy()
    }
    await admin?.context.close()
    await client?.context.close()
})

test('рецепт проходит путь от команды до клиента и обратно из «не предлагать»', async ({ browser, baseURL }) => {
    test.setTimeout(120_000)

    // --- Команда: рецепт из продукта каталога, отправлен на проверку ------
    admin = await sessionAs(browser, baseURL!, 'admin')
    const headers = asUser(admin.token)

    const search = await admin.context.request.get(
        `/api/v1/admin/recipes/catalogue-search?q=${encodeURIComponent('Творог')}`,
        { headers }
    )
    expect(search.ok(), await search.text()).toBeTruthy()
    const foods = (await search.json()).data.items as Array<{ food_id: string | number; name: string }>
    // seed-e2e кладёт «Творог 5%» в пустой каталог; без него рецепт собрать не из чего.
    expect(foods.length, 'в каталоге нет творога — прогнан ли seed-e2e?').toBeGreaterThan(0)

    const created = await admin.context.request.post('/api/v1/admin/recipes', {
        headers,
        data: {
            name: RECIPE_NAME,
            description: 'Рецепт прогона E2E',
            photo_key: null,
            cook_minutes: 20,
            complexity: 'easy',
            servings: 2,
            yield_grams: 300,
            meal_types: ['breakfast'],
            tags: [],
            allergens: [],
            ingredients: [
                { food_id: foods[0].food_id, grams: 250, display_quantity: null, to_taste: false },
            ],
            steps: [{ text: 'Смешать и обжарить', photo_key: null }],
        },
    })
    expect(created.status(), await created.text()).toBe(201)
    recipeId = (await created.json()).data.recipe.id as string

    const submitted = await admin.context.request.post(`/api/v1/admin/recipes/${recipeId}/submit`, { headers })
    expect(submitted.ok(), await submitted.text()).toBeTruthy()

    // До одобрения клиент рецепта не видит.
    client = await sessionAs(browser, baseURL!, 'client')
    const hidden = await client.context.request.get(`/api/v1/recipes/${recipeId}`, {
        headers: asUser(client.token),
    })
    expect(hidden.status()).toBe(404)

    // --- Куратор: одобряет на экране -------------------------------------
    const curator = await sessionAs(browser, baseURL!, 'curator')
    try {
        await curator.page.goto('/curator/recipes')
        await expect(curator.page.getByRole('heading', { name: 'Рецепты на проверке' })).toBeVisible({
            timeout: 15000,
        })
        await dismissCookieBanner(curator.page)
        await curator.page.getByRole('link', { name: new RegExp(RECIPE_NAME) }).click()
        await expect(curator.page.getByRole('heading', { level: 1, name: RECIPE_NAME })).toBeVisible({
            timeout: 15000,
        })
        await curator.page.getByRole('button', { name: 'Одобрить', exact: true }).click()
        await expect(curator.page).toHaveURL(/\/curator\/recipes$/, { timeout: 15000 })
    } finally {
        await curator.context.close()
    }

    // --- Клиент: видит в «Меню», открывает, отклоняет ----------------------
    const page = client.page
    await searchMenu(page, RECIPE_NAME)
    const card = page.getByRole('link', { name: new RegExp(RECIPE_NAME) })
    await expect(card).toBeVisible({ timeout: 15000 })
    await card.click()

    await expect(page.getByRole('heading', { level: 1, name: RECIPE_NAME })).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('Смешать и обжарить')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Ингредиенты' })).toBeVisible()

    await page.getByRole('button', { name: 'Не предлагать это блюдо' }).click()
    await expect(page).toHaveURL(/\/menu\?tab=recipes$/, { timeout: 15000 })

    await searchMenu(page, RECIPE_NAME)
    await expect(page.getByText('По этому запросу ничего не нашлось')).toBeVisible({ timeout: 15000 })

    // --- Клиент: возвращает блюдо в настройках ------------------------------
    await page.goto('/settings/food-restrictions')
    await expect(page.getByRole('heading', { level: 1, name: 'Ограничения в питании' })).toBeVisible({
        timeout: 15000,
    })
    await dismissCookieBanner(page)
    await page.getByRole('button', { name: `Вернуть: ${RECIPE_NAME}` }).click()
    await expect(page.getByRole('button', { name: `Вернуть: ${RECIPE_NAME}` })).toBeHidden({ timeout: 15000 })

    await searchMenu(page, RECIPE_NAME)
    await expect(page.getByRole('link', { name: new RegExp(RECIPE_NAME) })).toBeVisible({ timeout: 15000 })
})
