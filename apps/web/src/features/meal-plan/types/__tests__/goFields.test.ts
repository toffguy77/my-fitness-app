/**
 * Сторож имён полей: типы плана на клиенте против json-тегов Go.
 *
 * Тесты экранов подменяют транспорт и говорят теми именами, которые знает
 * клиент, — подмена, повторяющая ошибку кода, её подтверждает. Здесь имена
 * берутся из исходника Go модуля `mealplan`: структура ищется по имени в
 * файлах пакета, кроме тестов.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const MODULE = join(process.cwd(), '..', 'api', 'internal', 'modules', 'mealplan')
const TS_TYPES = join(process.cwd(), 'src', 'features', 'meal-plan', 'types', 'index.ts')

/**
 * Файлы самого пакета, без вложенных: у `mealplan/generator` свои структуры с
 * теми же именами (`Nutrition`) и без json-тегов — это не ответ API.
 */
function goSources(dir: string): string {
    return readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.go') && !entry.name.endsWith('_test.go'))
        .map((entry) => readFileSync(join(dir, entry.name), 'utf8'))
        .join('\n')
}

const go = existsSync(MODULE) ? goSources(MODULE) : ''
const ts = readFileSync(TS_TYPES, 'utf8')

/** json-имена полей структуры Go (без `-`). */
function goFields(typeName: string): string[] {
    const start = go.indexOf(`type ${typeName} struct {`)
    if (start === -1) throw new Error(`структура ${typeName} не найдена в ${MODULE}`)
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

/**
 * Имя структуры Go для интерфейса TS: первое из вариантов, которое есть в
 * модуле. Бэкенд волен назвать `Alternative` и `AlternativeOut` — сторожу
 * важны поля, а не имя типа.
 */
function goName(candidates: string[]): string {
    const found = candidates.find((name) => go.includes(`type ${name} struct {`))
    if (!found) throw new Error(`ни одна из структур ${candidates.join(', ')} не найдена в ${MODULE}`)
    return found
}

describe('типы плана совпадают с json-тегами Go', () => {
    it.each([
        ['MealPlan', ['MealPlan', 'PlanResponse', 'Plan']],
        ['PlanItem', ['PlanItem', 'Item', 'PlanItemResponse']],
        ['EmptySlot', ['EmptySlot']],
        ['Deviation', ['Deviation']],
        ['Nutrition', ['Nutrition']],
        ['CalorieSplit', ['CalorieSplit']],
        ['Alternative', ['Alternative', 'AlternativeResponse']],
        ['PlanItemUpdate', ['PlanItemUpdate', 'ItemUpdate', 'UpdateItemInput', 'ItemInput']],
        ['MealPlanSettings', ['MealPlanSettings', 'Settings', 'SettingsInput']],
        // plan-diary-logging: «Съел».
        ['EatRequest', ['EatRequest', 'EatInput', 'EatItemInput', 'EatBody']],
        ['EatResponse', ['EatResponse', 'EatResult', 'EatOutput']],
    ])('%s', (tsName, candidates) => {
        const name = goName(candidates)
        // Пустой разбор с обеих сторон совпал бы — и ничего бы не проверил.
        expect(goFields(name).length).toBeGreaterThan(0)
        expect(tsFields(tsName)).toEqual(goFields(name))
    })

    it('обёртка альтернатив — `{items}`, как отвечает обработчик', () => {
        // Своей структуры у обёртки нет: обработчик отвечает `gin.H{"items": …}`.
        const handler = readFileSync(join(MODULE, 'handler.go'), 'utf8')
        expect(handler).toContain('gin.H{"items": items}')
        expect(tsFields('AlternativesResponse')).toEqual(['items'])
    })

    it('модуль Go существует', () => {
        // Без модуля сторожить нечего — и это провал, а не пропуск: молча
        // пропущенный сторож остаётся пропущенным навсегда.
        expect(existsSync(MODULE)).toBe(true)
    })
})
