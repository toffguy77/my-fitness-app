import { mealPlanApi } from '../mealPlanApi'

jest.mock('@/shared/utils/api-client', () => ({
    apiClient: { get: jest.fn().mockResolvedValue({}), post: jest.fn().mockResolvedValue({}), put: jest.fn().mockResolvedValue({}) },
}))

import { apiClient } from '@/shared/utils/api-client'

describe('mealPlanApi — пути и тела по контракту', () => {
    it('план, пересборка, альтернативы, правка', async () => {
        await mealPlanApi.get('2026-10-10')
        expect(apiClient.get).toHaveBeenLastCalledWith('/api/v1/meal-plans/2026-10-10')

        await mealPlanApi.regenerate('2026-10-10')
        expect(apiClient.post).toHaveBeenLastCalledWith('/api/v1/meal-plans/2026-10-10/regenerate', {})

        await mealPlanApi.alternatives('2026-10-10', 'dinner')
        expect(apiClient.get).toHaveBeenLastCalledWith('/api/v1/meal-plans/2026-10-10/items/dinner/alternatives')

        await mealPlanApi.updateItem('2026-10-10', 'lunch', { locked: true })
        expect(apiClient.put).toHaveBeenLastCalledWith('/api/v1/meal-plans/2026-10-10/items/lunch', { locked: true })
    })

    it('настройки приёмов пищи', async () => {
        await mealPlanApi.getSettings()
        expect(apiClient.get).toHaveBeenLastCalledWith('/api/v1/meal-plan-settings')

        await mealPlanApi.saveSettings({ meal_types: ['lunch'] })
        expect(apiClient.put).toHaveBeenLastCalledWith('/api/v1/meal-plan-settings', { meal_types: ['lunch'] })
    })

    it('план без сборки, «Съел», подгонка остатка', async () => {
        await mealPlanApi.getExisting('2026-10-10')
        expect(apiClient.get).toHaveBeenLastCalledWith('/api/v1/meal-plans/2026-10-10?generate=false')

        await mealPlanApi.eat('2026-10-10', 'lunch')
        expect(apiClient.post).toHaveBeenLastCalledWith('/api/v1/meal-plans/2026-10-10/items/lunch/eat', {})

        await mealPlanApi.eat('2026-10-10', 'dinner', { grams: 280, time: '19:05' })
        expect(apiClient.post).toHaveBeenLastCalledWith('/api/v1/meal-plans/2026-10-10/items/dinner/eat', {
            grams: 280,
            time: '19:05',
        })

        await mealPlanApi.refit('2026-10-10')
        expect(apiClient.post).toHaveBeenLastCalledWith('/api/v1/meal-plans/2026-10-10/refit', {})
    })

    it('список покупок: без диапазона и с ним', async () => {
        await mealPlanApi.shoppingList()
        expect(apiClient.get).toHaveBeenLastCalledWith('/api/v1/shopping-list')

        await mealPlanApi.shoppingList({ from: '2026-10-13', to: '2026-10-15' })
        expect(apiClient.get).toHaveBeenLastCalledWith('/api/v1/shopping-list?from=2026-10-13&to=2026-10-15')
    })
})
