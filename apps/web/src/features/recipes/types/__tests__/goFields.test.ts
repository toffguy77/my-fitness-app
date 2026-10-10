/**
 * Сторож имён полей: типы рецептов на клиенте против json-тегов Go.
 *
 * Тесты экранов подменяют транспорт и сами говорят теми именами, которые
 * знает клиент, — подмена, повторяющая ошибку кода, её подтверждает. Так
 * «Недавние» в дневнике не показывались никогда: сервер отдавал `foods`, а
 * клиент читал `items`. Здесь имена берутся из исходника Go.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const API = join(process.cwd(), '..', 'api', 'internal', 'modules')
const GO_SOURCES = [
    join(API, 'recipes', 'types.go'),
    join(API, 'recipes', 'importer.go'),
    join(API, 'food-tracker', 'catalogue.go'),
]
const TS_TYPES = join(process.cwd(), 'src', 'features', 'recipes', 'types', 'index.ts')

const go = GO_SOURCES.map((file) => readFileSync(file, 'utf8')).join('\n')
const ts = readFileSync(TS_TYPES, 'utf8')

/** json-имена полей структуры Go (без `-`). */
function goFields(typeName: string): string[] {
    const start = go.indexOf(`type ${typeName} struct {`)
    if (start === -1) throw new Error(`структура ${typeName} не найдена`)
    const end = go.indexOf('\n}', start)
    return [...go.slice(start, end).matchAll(/json:"([^",]+)/g)]
        .map((m) => m[1])
        .filter((name) => name !== '-')
        .sort()
}

/** Поля верхнего уровня интерфейса TypeScript. */
function tsFields(typeName: string): string[] {
    const start = ts.indexOf(`export interface ${typeName} {`)
    if (start === -1) throw new Error(`интерфейс ${typeName} не найден`)
    const body = ts.slice(ts.indexOf('{', start) + 1)
    const fields: string[] = []
    let depth = 0
    for (const line of body.split('\n')) {
        if (depth === 0) {
            if (/^}/.test(line)) break
            const m = line.match(/^\s+(\w+)\??:/)
            if (m) fields.push(m[1])
        }
        depth += (line.match(/{/g) ?? []).length - (line.match(/}/g) ?? []).length
    }
    return fields.sort()
}

/** Поля встроенного типа элемента массива: `name: { a: …; b: … }[]`. */
function tsInlineFields(typeName: string, field: string): string[] {
    const start = ts.indexOf(`export interface ${typeName} {`)
    const line = ts.slice(start).match(new RegExp(`\\n\\s+${field}\\??: \\{([^}]*)\\}`))
    if (!line) throw new Error(`поле ${typeName}.${field} не найдено`)
    return [...line[1].matchAll(/(\w+)\??:/g)].map((m) => m[1]).sort()
}

describe('типы рецептов совпадают с json-тегами Go', () => {
    it.each([
        ['RecipeVersion', 'RecipeVersion'],
        ['RecipeSummary', 'RecipeSummary'],
        ['Ingredient', 'Ingredient'],
        ['Step', 'Step'],
        ['Nutrition', 'Nutrition'],
        ['IngredientCandidate', 'Candidate'],
        ['RecipeBundle', 'RecipeDetail'],
        ['FoodRestrictions', 'FoodRestrictions'],
        ['NamedRef', 'RecipeRef'],
        ['VersionInput', 'VersionInput'],
        ['IngredientInput', 'IngredientInput'],
        ['StepInput', 'StepInput'],
        ['FoodRestrictionsInput', 'RestrictionsInput'],
        ['VkusvillRecipe', 'VkusvillItem'],
        ['VkusvillSearch', 'VkusvillResults'],
        ['UploadedPhoto', 'UploadedPhoto'],
        ['CatalogueFood', 'CatalogueFood'],
    ])('%s ↔ Go %s', (tsName, goName) => {
        // Пустой разбор с обеих сторон совпал бы — и ничего бы не проверил.
        expect(goFields(goName).length).toBeGreaterThan(0)
        expect(tsFields(tsName)).toEqual(goFields(goName))
    })

    it('исключённый продукт ↔ Go FoodRef', () => {
        expect(tsInlineFields('FoodRestrictions', 'excluded_foods')).toEqual(goFields('FoodRef'))
    })
})
