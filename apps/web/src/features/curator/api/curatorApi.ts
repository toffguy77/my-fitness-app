import { apiClient } from '@/shared/utils/api-client'
import type { ClientCard, ClientDetail } from '../types'

const BASE = '/backend-api/v1/curator'

export const curatorApi = {
    getClients: () => apiClient.get<ClientCard[]>(`${BASE}/clients`),
    getClientDetail: (id: number, date?: string) =>
        apiClient.get<ClientDetail>(`${BASE}/clients/${id}${date ? `?date=${date}` : ''}`),
    setTargetWeight: (clientId: number, targetWeight: number | null) =>
        apiClient.put(`${BASE}/clients/${clientId}/target-weight`, { target_weight: targetWeight }),
}
