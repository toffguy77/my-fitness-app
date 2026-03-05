import { apiClient } from '@/shared/utils/api-client'
import type { CalculatedTargets, HistoryResponse } from '../types'

export async function getTargets(date?: string): Promise<CalculatedTargets | null> {
    const params = date ? `?date=${date}` : ''
    const res = await apiClient.get<{ targets: CalculatedTargets | null }>(
        `/backend-api/v1/nutrition-calc/targets${params}`
    )
    return res.targets
}

export async function getHistory(days = 7): Promise<HistoryResponse> {
    return apiClient.get<HistoryResponse>(
        `/backend-api/v1/nutrition-calc/history?days=${days}`
    )
}

export async function recalculate(): Promise<CalculatedTargets> {
    const res = await apiClient.post<{ targets: CalculatedTargets }>(
        '/backend-api/v1/nutrition-calc/recalculate',
        {}
    )
    return res.targets
}

export async function getClientHistory(clientId: number, days = 7): Promise<HistoryResponse> {
    return apiClient.get<HistoryResponse>(
        `/backend-api/v1/curator/clients/${clientId}/targets/history?days=${days}`
    )
}
