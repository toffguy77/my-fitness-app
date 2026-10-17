import { cn } from '@/shared/utils/cn'
import { t } from '@/shared/i18n'

/**
 * Источник метрики дня, как его отдаёт API (daily-metric-source): `manual`,
 * `healthkit` или null, когда значения нет.
 */
export type MetricSource = 'manual' | 'healthkit'

export interface HealthSourceLabelProps {
    source?: MetricSource | string | null
    className?: string
}

/**
 * Подпись «из Здоровья» у шагов, веса и тренировки, пришедших из Apple
 * Здоровья. У ручного значения подписи нет: это обычный случай, и подпись на
 * каждом числе была бы шумом.
 */
export function HealthSourceLabel({ source, className }: HealthSourceLabelProps) {
    if (source !== 'healthkit') return null
    return (
        <span
            className={cn('type-caption text-fg-subtle', className)}
            title={t('metricSource.healthkitTitle')}
            data-testid="health-source"
        >
            {t('metricSource.healthkit')}
        </span>
    )
}
