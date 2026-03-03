import { apiClient } from '@/shared/utils/api-client'
import type { ClientCard, ClientDetail } from '../types'

const BASE = '/backend-api/v1/curator'

export const curatorApi = {
    getClients: () => apiClient.get<ClientCard[]>(`${BASE}/clients`),
    getClientDetail: (id: number, days?: number) =>
        apiClient.get<ClientDetail>(`${BASE}/clients/${id}?days=${days ?? 7}`),
    setTargetWeight: (clientId: number, targetWeight: number | null) =>
        apiClient.put(`${BASE}/clients/${clientId}/target-weight`, { target_weight: targetWeight }),
    setWaterGoal: (clientId: number, waterGoal: number | null) =>
        apiClient.put(`${BASE}/clients/${clientId}/water-goal`, { water_goal: waterGoal }),
}
