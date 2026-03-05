import { apiClient } from '@/shared/utils/api-client'
import type { CalculatedTargets, HistoryResponse } from '../types'

export async function getTargets(date?: string): Promise<CalculatedTargets | null> {
    const params = date ? `?date=${date}` : ''
    const res = await apiClient.get<CalculatedTargets & { targets?: CalculatedTargets | null }>(
        `/backend-api/v1/nutrition-calc/targets${params}`
    )
    // Handler returns DailyTargetRecord directly when found,
    // or {targets: null} when profile is incomplete
    if (res.targets === null) return null
    if (res.calories !== undefined) return res
    return res.targets ?? null
}

export async function getHistory(days = 7): Promise<HistoryResponse> {
    return apiClient.get<HistoryResponse>(
        `/backend-api/v1/nutrition-calc/history?days=${days}`
    )
}

export async function recalculate(): Promise<CalculatedTargets> {
    const res = await apiClient.post<CalculatedTargets & { targets?: CalculatedTargets }>(
        '/backend-api/v1/nutrition-calc/recalculate',
        {}
    )
    if (res.calories !== undefined) return res
    return res.targets!
}

export async function getClientHistory(clientId: number, days = 7): Promise<HistoryResponse> {
    return apiClient.get<HistoryResponse>(
        `/backend-api/v1/curator/clients/${clientId}/targets/history?days=${days}`
    )
}
