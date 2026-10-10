import { apiClient } from '@/shared/utils/api-client'
import type {
    AlternativesResponse,
    MealPlan,
    MealPlanSettings,
    MealType,
    PlanItemUpdate,
} from '../types'

// Пути — полными литералами: check-api-contract.mjs сверяет их с
// routes.golden, а `/api/v1/meal-plans` сам по себе маршрутом не является —
// константа с ним читалась бы как вызов несуществующего пути.
const SETTINGS_PATH = '/api/v1/meal-plan-settings'

export const mealPlanApi = {
    /** План на дату (`YYYY-MM-DD`); сервер собирает его при первом открытии. */
    get: (date: string) => apiClient.get<MealPlan>(`/api/v1/meal-plans/${date}`),

    regenerate: (date: string) => apiClient.post<MealPlan>(`/api/v1/meal-plans/${date}/regenerate`, {}),

    alternatives: (date: string, mealType: MealType) =>
        apiClient.get<AlternativesResponse>(`/api/v1/meal-plans/${date}/items/${mealType}/alternatives`),

    updateItem: (date: string, mealType: MealType, update: PlanItemUpdate) =>
        apiClient.put<MealPlan>(`/api/v1/meal-plans/${date}/items/${mealType}`, update),

    getSettings: () => apiClient.get<MealPlanSettings>(SETTINGS_PATH),

    saveSettings: (settings: MealPlanSettings) => apiClient.put<MealPlanSettings>(SETTINGS_PATH, settings),
}
