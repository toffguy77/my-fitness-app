/**
 * События каталога рецептов объявлены на клиенте теми же именами, что и в
 * словаре сервера (apps/api/internal/modules/analytics/dictionary.go): имя,
 * которого сервер не знает, отвергается вместе со всем пакетом.
 */
import { EVENTS } from '../events'

describe('события каталога рецептов', () => {
    it.each([
        ['menuOpened', 'menu_opened'],
        ['recipeOpened', 'recipe_opened'],
        ['recipeRejected', 'recipe_rejected'],
        ['recipeSubmitted', 'recipe_submitted'],
        ['recipeApproved', 'recipe_approved'],
    ])('%s → %s', (key, name) => {
        expect(EVENTS[key as keyof typeof EVENTS]).toBe(name)
    })
})
