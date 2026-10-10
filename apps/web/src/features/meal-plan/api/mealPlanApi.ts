import { apiClient } from '@/shared/utils/api-client'
import type {
    AlternativesResponse,
    EatRequest,
    EatResponse,
    MealPlan,
    MealPlanSettings,
    MealType,
    PlanItemUpdate,
    ShoppingList,
} from '../types'

// Пути — полными литералами: check-api-contract.mjs сверяет их с
// routes.golden, а `/api/v1/meal-plans` сам по себе маршрутом не является —
// константа с ним читалась бы как вызов несуществующего пути.
const SETTINGS_PATH = '/api/v1/meal-plan-settings'

export const mealPlanApi = {
    /** План на дату (`YYYY-MM-DD`); сервер собирает его при первом открытии. */
    get: (date: string) => apiClient.get<MealPlan>(`/api/v1/meal-plans/${date}`),

    /**
     * План на дату, если он уже есть; `undefined` — плана нет (`204`).
     *
     * Только этот вариант зовёт дневник: просмотр дневника план не собирает
     * (`plan-diary-logging`, требование «Запланированное в дневнике»).
     */
    getExisting: (date: string) =>
        apiClient.get<MealPlan | undefined>(`/api/v1/meal-plans/${date}?generate=false`),

    regenerate: (date: string) => apiClient.post<MealPlan>(`/api/v1/meal-plans/${date}/regenerate`, {}),

    /** «Съел»: запись дневника с весом плана или переданным; повтор возвращает ту же запись. */
    eat: (date: string, mealType: MealType, body: EatRequest = {}) =>
        apiClient.post<EatResponse>(`/api/v1/meal-plans/${date}/items/${mealType}/eat`, body),

    /** «Подогнать остаток»: съеденное — факт, подгоняются несъеденные. */
    refit: (date: string) => apiClient.post<MealPlan>(`/api/v1/meal-plans/${date}/refit`, {}),

    alternatives: (date: string, mealType: MealType) =>
        apiClient.get<AlternativesResponse>(`/api/v1/meal-plans/${date}/items/${mealType}/alternatives`),

    updateItem: (date: string, mealType: MealType, update: PlanItemUpdate) =>
        apiClient.put<MealPlan>(`/api/v1/meal-plans/${date}/items/${mealType}`, update),

    getSettings: () => apiClient.get<MealPlanSettings>(SETTINGS_PATH),

    saveSettings: (settings: MealPlanSettings) => apiClient.put<MealPlanSettings>(SETTINGS_PATH, settings),

    /**
     * Список покупок за диапазон дат включительно; без диапазона сервер берёт
     * сегодня и последний день с планом в пределах недели. Планы не собирает.
     */
    shoppingList: (range?: { from: string; to: string }) =>
        apiClient.get<ShoppingList>(
            range
                ? `/api/v1/shopping-list?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`
                : '/api/v1/shopping-list'
        ),
}
