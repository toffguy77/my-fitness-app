import { apiClient } from '@/shared/utils/api-client'
import { formatLocalDate } from '@/shared/utils/format'

export async function completeOnboarding(): Promise<void> {
    await apiClient.put('/api/v1/users/onboarding/complete', {})
}

/**
 * Сегодняшний день в часовом поясе, который человек выбрал на первом шаге.
 * Сервер разбирает дату замера в поясе пользователя; браузер может стоять в
 * другом, и тогда замер, сделанный поздно вечером, лёг бы на соседний день.
 */
export function todayIn(timezone: string | undefined, now: Date = new Date()): string {
    if (timezone) {
        try {
            // en-CA форматирует дату как ГГГГ-ММ-ДД.
            return new Intl.DateTimeFormat('en-CA', {
                timeZone: timezone,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
            }).format(now)
        } catch {
            // Неизвестный поясу браузеру идентификатор — берём местный день.
        }
    }
    return formatLocalDate(now)
}

/**
 * «Текущий вес» из онбординга — замер за сегодня, тот же, что пишет карточка
 * веса на дашборде. Раньше он уходил в настройки как `target_weight`, и
 * человек, введший свой вес, получал его же в качестве цели.
 */
export async function saveWeightMeasurement(weightKg: number, date: string): Promise<void> {
    await apiClient.post('/api/v1/dashboard/daily', {
        date,
        metric: { type: 'weight', data: { weight: weightKg } },
    })
}
