import { apiClient } from '@/shared/utils/api-client'
import type {
    CalculatedTargets,
    HistoryResponse,
    MissingTargetInputs,
    TargetsAnswer,
} from '../types'

/**
 * Норма на дату — или то, чего для неё не хватает.
 *
 * Отсутствие нормы не заменяется числом. 2000 ккал и 150 г белка, которые тут
 * стояли раньше, показывались как личная норма человека, и от них считались
 * проценты выполнения, цвет калорий и алерты куратору. На проде такую норму
 * видели 16 из 18 клиентов.
 */
export async function getTargets(date?: string): Promise<TargetsAnswer> {
    const params = date ? `?date=${date}` : ''
    const res = await apiClient.get<
        CalculatedTargets & {
            targets?: CalculatedTargets | null
            missing?: MissingTargetInputs | null
        }
    >(`/api/v1/nutrition-calc/targets${params}`)

    // Handler returns DailyTargetRecord directly when found,
    // or {targets: null, missing: {...}} when the calculation is impossible.
    if (res.calories !== undefined) return { targets: res, missing: null }
    return { targets: res.targets ?? null, missing: res.missing ?? null }
}

export async function getHistory(days = 7): Promise<HistoryResponse> {
    return apiClient.get<HistoryResponse>(
        `/api/v1/nutrition-calc/history?days=${days}`
    )
}

export async function recalculate(): Promise<CalculatedTargets> {
    const res = await apiClient.post<CalculatedTargets & { targets?: CalculatedTargets }>(
        '/api/v1/nutrition-calc/recalculate',
        {}
    )
    if (res.calories !== undefined) return res
    return res.targets!
}

export async function getClientHistory(clientId: number, days = 7): Promise<HistoryResponse> {
    return apiClient.get<HistoryResponse>(
        `/api/v1/curator/clients/${clientId}/targets/history?days=${days}`
    )
}
