import { isApiError } from '@/shared/errors/apiErrors'
import type { MissingTargetInputs } from '@/features/nutrition-calc/types'
import { t } from '@/shared/i18n'
import type { Deviation, MissingInput } from '../types'

/**
 * Отклонение словами: «Не хватает 25 г белка», «Калорий больше цели на 120 ккал».
 *
 * Знак решает направление, модуль — число; дробную часть сервер может прислать,
 * человеку она ничего не добавляет.
 */
export function deviationText(deviation: Deviation): string {
    const value = Math.round(Math.abs(deviation.delta))
    const direction = deviation.delta < 0 ? 'under' : 'over'
    return t(`mealPlan.deviation.${direction}.${deviation.nutrient}`, { value })
}

/**
 * `409 target_missing`: план не строится, пока нет нормы. Возвращает, чего не
 * хватает, в той форме, которую понимает `CalculateTargetPrompt`; `null` —
 * ошибка другая.
 */
export function targetMissingFrom(error: unknown): MissingTargetInputs | null {
    if (!isApiError(error) || error.status !== 409) return null
    const body = error.data as { code?: string; params?: { missing?: MissingInput[] } } | undefined
    if (body?.code !== 'target_missing') return null
    const missing = Array.isArray(body.params?.missing) ? body.params.missing : []
    return { profile: missing.includes('profile'), weight: missing.includes('weight') }
}
