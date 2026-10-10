#!/usr/bin/env node
/**
 * Пакетный импорт рецептов ВкусВилла в каталог «Меню».
 *
 * Для каждого подходящего рецепта ВкусВилла (завтрак, обед, ужин, «много
 * белка», «низкокалорийное»; без «профи», праздников, соусов и напитков):
 *   1. подбирает продукт нашего каталога для каждого ингредиента и сверяет его
 *      калорийность с карточкой товара ВкусВилла;
 *   2. переводит подписи количества («3 шт.», «2 ст. л.») в граммы;
 *   3. выводит вес готового блюда из калорийности ВкусВилла на 100 г и сверяет
 *      БЖУ на 100 г;
 *   4. если всё сошлось — импортирует через наш API тем же путём, что редактор:
 *      импорт → черновик → на проверку → одобрение служебным куратором.
 * Рецепт, не прошедший проверку, не импортируется: он попадает в отчёт с причиной.
 *
 * Запуск:
 *   IMPORT_ADMIN_EMAIL=… IMPORT_ADMIN_PASSWORD=… \
 *   IMPORT_CURATOR_EMAIL=… IMPORT_CURATOR_PASSWORD=… \
 *   node scripts/import-vkusvill-recipes.mjs --base https://new.burcev.team [--dry-run] [--limit 10] [--report out.json]
 *
 * Без --dry-run пишет в базу стенда. Повторный запуск безопасен: уже
 * импортированные рецепты пропускаются.
 */
import { writeFileSync } from 'node:fs'
import {
    catalogueQueries,
    chooseCandidate,
    compareWithVkusvill,
    deriveYield,
    eligible,
    ingredientLines,
    mealTypesFor,
    parseQuantity,
    parseVkusvillNutrition,
    totals,
} from './vkusvill-import/lib.mjs'

const args = process.argv.slice(2)
const opt = (name, fallback) => {
    const i = args.indexOf(`--${name}`)
    return i >= 0 ? args[i + 1] : fallback
}
const BASE = opt('base')
const DRY = args.includes('--dry-run')
const LIMIT = Number(opt('limit', '0')) || Infinity
const REPORT = opt('report', 'vkusvill-import-report.json')
const MCP = process.env.VKUSVILL_MCP_URL || 'https://mcp.vkusvill.ru/mcp'
const CATEGORIES = [339, 2273, 2277, 2368, 2370] // завтрак, обед, ужин, много белка, низкокалорийное
if (!BASE) {
    console.error('нужен --base https://<стенд>')
    process.exit(2)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let lastMcp = 0

/** Вызов MCP ВкусВилла с паузой: лимит у них 60 запросов в минуту. */
async function mcp(name, argsObj) {
    const wait = lastMcp + 1100 - Date.now()
    if (wait > 0) await sleep(wait)
    lastMcp = Date.now()
    for (let attempt = 0; attempt < 4; attempt++) {
        const res = await fetch(MCP, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json, text/event-stream',
                'User-Agent': 'burcev-recipe-import/1.0 (+https://burcev.team)',
            },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: argsObj } }),
        })
        if (res.status === 429 || res.status >= 500) {
            await sleep(5000 * (attempt + 1))
            continue
        }
        if (!res.ok) throw new Error(`MCP ${name}: HTTP ${res.status}`)
        const body = await res.json()
        return JSON.parse(body.result.content[0].text)
    }
    throw new Error(`MCP ${name}: не ответил`)
}

// --- наш API ------------------------------------------------------------------
const tokens = {}
async function login(role) {
    const email = process.env[`IMPORT_${role.toUpperCase()}_EMAIL`]
    const password = process.env[`IMPORT_${role.toUpperCase()}_PASSWORD`]
    if (!email || !password) throw new Error(`нет IMPORT_${role.toUpperCase()}_EMAIL/PASSWORD`)
    const res = await fetch(`${BASE}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
    })
    if (!res.ok) throw new Error(`вход ${role}: HTTP ${res.status}`)
    tokens[role] = (await res.json()).data.token
}
async function api(role, method, path, body) {
    for (let attempt = 0; attempt < 2; attempt++) {
        if (!tokens[role]) await login(role)
        const res = await fetch(`${BASE}${path}`, {
            method,
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens[role]}` },
            body: body === undefined ? undefined : JSON.stringify(body),
        })
        if (res.status === 401) {
            tokens[role] = null // токен живёт 15 минут
            continue
        }
        const text = await res.text()
        const json = text ? JSON.parse(text) : {}
        return { status: res.status, data: json.data, error: json.message }
    }
    throw new Error(`${method} ${path}: 401 после повторного входа`)
}

const catalogueCache = new Map()
async function catalogue(name) {
    if (!catalogueCache.has(name)) {
        const merged = new Map()
        for (const q of catalogueQueries(name)) {
            const r = await api('admin', 'GET', `/api/v1/admin/recipes/catalogue-search?q=${encodeURIComponent(q)}`)
            for (const item of r.data?.items ?? []) if (!merged.has(item.food_id)) merged.set(item.food_id, item)
            if (merged.size >= 10) break
        }
        catalogueCache.set(name, [...merged.values()])
    }
    return catalogueCache.get(name)
}

const productCache = new Map()
async function vkusvillNutrition(ids) {
    for (const id of (ids ?? []).slice(0, 3)) {
        if (!productCache.has(id)) {
            try {
                const p = await mcp('vkusvill_product_details', { id: Number(id) })
                productCache.set(id, parseVkusvillNutrition(p.data?.properties))
            } catch {
                productCache.set(id, null)
            }
        }
        if (productCache.get(id)) return productCache.get(id)
    }
    return null
}

// --- разбор рецепта --------------------------------------------------------------

/** Полный разбор без записи: продукты, граммы, вес блюда, сверка. */
async function analyse(recipe) {
    const lines = []
    for (const ing of ingredientLines(recipe)) {
        const reference = await vkusvillNutrition(ing.ids)
        const pick = chooseCandidate(ing.name, await catalogue(ing.name), reference)
        if (pick.error) return { error: pick.error }
        const q = parseQuantity(ing.quantity, ing.name, pick.candidate.default_weight ?? 0)
        if (q.error) return { error: `«${ing.name}»: ${q.error}` }
        lines.push({ name: ing.name, quantity: ing.quantity, candidate: pick.candidate, toTaste: !!q.toTaste, grams: q.grams ?? null })
    }
    const sum = totals(lines)
    if (sum.grams <= 0) return { error: 'нет ингредиентов с весом' }
    const y = deriveYield(sum, recipe.nutritional)
    if (y.error) return { error: y.error }
    const cmp = compareWithVkusvill(sum, y.grams, recipe.nutritional)
    if (cmp.error) return { error: cmp.error }
    const portions = Math.max(1, Number(recipe.portions) || 1)
    return { lines, yieldGrams: y.grams, portionKcal: sum.kcal / portions }
}

/** Импорт и доводка до одобренной версии. */
async function importRecipe(recipe, plan) {
    const imp = await api('admin', 'POST', `/api/v1/admin/recipes/import/vkusvill/${recipe.id}?q=${encodeURIComponent(recipe.name)}`)
    if (imp.status !== 201 && imp.status !== 200) return { error: `импорт: HTTP ${imp.status} ${imp.error ?? ''}` }
    const id = imp.data.recipe_id
    if (imp.data.existing) {
        const cur = await api('admin', 'GET', `/api/v1/admin/recipes/${id}`)
        if (cur.data?.approved) return { skipped: 'уже в каталоге', id }
    }
    const got = await api('admin', 'GET', `/api/v1/admin/recipes/${id}`)
    const w = got.data?.working
    if (!w) return { error: 'нет рабочей версии после импорта', id }
    const sameOrder =
        w.ingredients.length === plan.lines.length &&
        w.ingredients.every((ing, i) => (ing.source_name ?? '') === plan.lines[i].name)
    if (!sameOrder) return { error: 'состав черновика не совпал с рецептом ВкусВилла', id }
    const input = {
        name: w.name,
        description: w.description,
        cook_minutes: w.cook_minutes,
        complexity: w.complexity,
        servings: w.servings,
        tags: w.tags,
        allergens: w.allergens,
        photo_key: w.photo_key,
        yield_grams: plan.yieldGrams,
        meal_types: mealTypesFor(w.meal_types, recipe, plan.portionKcal),
        ingredients: w.ingredients.map((ing, i) => ({
            food_id: plan.lines[i].candidate.food_id,
            source_name: ing.source_name,
            grams: plan.lines[i].toTaste ? null : Math.round(plan.lines[i].grams),
            display_quantity: ing.display_quantity,
            to_taste: plan.lines[i].toTaste,
        })),
        steps: w.steps.map((s) => ({ text: s.text, photo_key: s.photo_key })),
    }
    const saved = await api('admin', 'PUT', `/api/v1/admin/recipes/${id}/draft`, input)
    if (saved.status !== 200) return { error: `черновик: HTTP ${saved.status} ${saved.error ?? ''}`, id }
    // Сервер считает КБЖУ сам — сверяем и его результат.
    const server = saved.data.per_100g
    const check = compareWithVkusvill(
        { protein: server.protein, fat: server.fat, carbs: server.carbs },
        100,
        recipe.nutritional
    )
    if (check.error) return { error: `после сохранения: ${check.error}`, id }
    const sub = await api('admin', 'POST', `/api/v1/admin/recipes/${id}/submit`)
    if (sub.status !== 200) return { error: `на проверку: HTTP ${sub.status} ${sub.error ?? ''}`, id }
    const ok = await api('curator', 'POST', `/api/v1/curator/recipes/${id}/approve`, {})
    if (ok.status !== 200) return { error: `одобрение: HTTP ${ok.status} ${ok.error ?? ''}`, id }
    return { imported: true, id, perPortion: saved.data.per_portion, mealTypes: input.meal_types }
}

// --- обход ---------------------------------------------------------------------

async function collect() {
    const seen = new Map()
    for (const cat of CATEGORIES) {
        for (let page = 1; ; page++) {
            const d = (
                await mcp('vkusvill_recipes', {
                    q: '', page, sort: 'popularity', id_feature_filter: 0, id_cooking_time_filter: 0,
                    id_cooking_method_filter: 0, id_complexity_filter: 0, id_category_filter: cat,
                    id_exclude_allergens_filter: [],
                })
            ).data
            for (const r of d.items) if (!seen.has(r.id) && eligible(r)) seen.set(r.id, r)
            if (!d.meta.has_more) break
        }
        console.error(`категория ${cat}: в отборе ${seen.size}`)
    }
    return [...seen.values()]
}

const report = { base: BASE, dryRun: DRY, startedAt: new Date().toISOString(), imported: [], skipped: [], rejected: [] }
const save = () => writeFileSync(REPORT, JSON.stringify(report, null, 2))
const recipes = (await collect()).slice(0, LIMIT)
console.error(`к разбору: ${recipes.length}`)
for (const [i, r] of recipes.entries()) {
    const plan = await analyse(r)
    if (plan.error) {
        report.rejected.push({ id: r.id, name: r.name, reason: plan.error })
    } else if (DRY) {
        report.imported.push({ id: r.id, name: r.name, yield: plan.yieldGrams, portionKcal: Math.round(plan.portionKcal) })
    } else {
        const res = await importRecipe(r, plan)
        if (res.error) report.rejected.push({ id: r.id, name: r.name, reason: res.error, recipeId: res.id })
        else if (res.skipped) report.skipped.push({ id: r.id, name: r.name, reason: res.skipped, recipeId: res.id })
        else report.imported.push({ id: r.id, name: r.name, recipeId: res.id, perPortion: res.perPortion, mealTypes: res.mealTypes })
    }
    if ((i + 1) % 10 === 0) {
        save()
        console.error(`${i + 1}/${recipes.length}: прошло ${report.imported.length}, отклонено ${report.rejected.length}, пропущено ${report.skipped.length}`)
    }
}
report.finishedAt = new Date().toISOString()
save()
console.log(JSON.stringify({ imported: report.imported.length, rejected: report.rejected.length, skipped: report.skipped.length, report: REPORT }))
