/**
 * События плана питания объявлены на клиенте теми же именами, что и в словаре
 * сервера (apps/api/internal/modules/analytics/dictionary.go): имя, которого
 * сервер не знает, отвергается вместе со всем пакетом.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { EVENTS } from '../events'

const GO_DICTIONARY = readFileSync(join(__dirname, '../../../../../api/internal/modules/analytics/dictionary.go'), 'utf8')

describe('события плана питания', () => {
    it.each([
        ['planGenerated', 'plan_generated'],
        ['planRegenerated', 'plan_regenerated'],
        ['planItemReplaced', 'plan_item_replaced'],
        ['planItemLocked', 'plan_item_locked'],
        ['planGramsSet', 'plan_grams_set'],
        ['planOffTarget', 'plan_off_target'],
    ])('%s → %s', (key, name) => {
        expect(EVENTS[key as keyof typeof EVENTS]).toBe(name)
        expect(GO_DICTIONARY).toContain(`"${name}"`)
    })
})
