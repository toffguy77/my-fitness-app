/**
 * Сторож полей продукта-рецепта в поиске дневника против json-тегов Go
 * (openspec plan-diary-logging, api.md: `recipeId` — camelCase, `source: "recipe"`).
 *
 * Тесты поиска подменяют ответ и говорят именами клиента — подмена,
 * повторяющая ошибку, её подтверждает. Здесь имена берутся из исходника Go.
 * Полного совпадения `FoodItem` нет и не было (у сервера есть created_at и
 * fiber_per_100, у клиента — additionalNutrients), поэтому сверяется ровно то,
 * что добавило это изменение.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const GO_TYPES = join(process.cwd(), '..', 'api', 'internal', 'modules', 'food-tracker', 'types.go')
const TS_TYPES = join(process.cwd(), 'src', 'features', 'food-tracker', 'types', 'index.ts')

const go = readFileSync(GO_TYPES, 'utf8')
const ts = readFileSync(TS_TYPES, 'utf8')

function goStruct(name: string): string {
    const start = go.indexOf(`type ${name} struct {`)
    if (start === -1) throw new Error(`структура ${name} не найдена в types.go`)
    return go.slice(start, go.indexOf('\n}', start))
}

describe('продукт-рецепт: имена полей совпадают с Go', () => {
    it('FoodItem.recipeId — json-тег Go и поле клиента', () => {
        const tags = [...goStruct('FoodItem').matchAll(/json:"([^",]+)/g)].map((m) => m[1])
        expect(tags).toContain('recipeId')
        expect(ts).toMatch(/\n\s+recipeId\?: string;/)
    })

    it('источник "recipe" объявлен на обеих сторонах', () => {
        expect(go).toMatch(/FoodSource\s*=\s*"recipe"/)
        expect(ts).toMatch(/export type FoodSource = [^;]*'recipe'/)
    })
})
