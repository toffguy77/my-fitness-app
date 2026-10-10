/**
 * События плана питания объявлены на клиенте теми же именами, что и в словаре
 * сервера (apps/api/internal/modules/analytics/dictionary.go): имя, которого
 * сервер не знает, отвергается вместе со всем пакетом.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { EVENTS } from '../events'

const GO_DICTIONARY = readFileSync(join(__dirname, '../../../../../api/internal/modules/analytics/dictionary.go'), 'utf8')

describe('события плана питания и списка покупок', () => {
    it.each([
        ['planGenerated', 'plan_generated'],
        ['planRegenerated', 'plan_regenerated'],
        ['planItemReplaced', 'plan_item_replaced'],
        ['planItemLocked', 'plan_item_locked'],
        ['planGramsSet', 'plan_grams_set'],
        ['planOffTarget', 'plan_off_target'],
        ['planItemEaten', 'plan_item_eaten'],
        ['planRefit', 'plan_refit'],
        ['recipeLoggedFromSearch', 'recipe_logged_from_search'],
        ['shoppingListOpened', 'shopping_list_opened'],
        ['shoppingListShared', 'shopping_list_shared'],
    ])('%s → %s', (key, name) => {
        expect(EVENTS[key as keyof typeof EVENTS]).toBe(name)
        expect(GO_DICTIONARY).toContain(`"${name}"`)
    })
})

describe('plan_item_eaten: source — объявленное свойство', () => {
    // Необъявленное свойство отвергает событие вместе с пакетом. Объявление —
    // от имени события до следующего объявления в словаре.
    it('source и значения plan, diary объявлены', () => {
        const start = GO_DICTIONARY.indexOf('EventPlanItemEaten:')
        expect(start).toBeGreaterThan(-1)
        const next = GO_DICTIONARY.slice(start + 1).search(/\n\s*Event\w+:/)
        const declaration = GO_DICTIONARY.slice(start, next === -1 ? undefined : start + 1 + next)
        expect(declaration).toContain('"source"')
        expect(declaration).toContain('"plan"')
        expect(declaration).toContain('"diary"')
    })
})
