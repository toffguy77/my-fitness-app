/**
 * ProgressSection component for displaying nutrition adherence
 *
 * Displays nutrition adherence percentage and recent achievements.
 *
 * Performance optimizations:
 * - React.memo to prevent unnecessary re-renders
 * - Memoized sub-components (AdherenceIndicator, AchievementItem)
 */

import { useState, useEffect, memo, useMemo } from 'react'
import { AlertCircle, Award, Activity } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/Card'
import { cn } from '@/shared/utils/cn'
import { apiClient } from '@/shared/utils/api-client'
import type { ProgressData } from '../types'
import { t } from '@/shared/i18n'
import { messageForOr } from '@/shared/errors/apiErrors'

/**
 * Props for ProgressSection component
 */
export interface ProgressSectionProps {
    className?: string
}

/**
 * Props for adherence indicator
 */
interface AdherenceIndicatorProps {
    percentage: number
    className?: string
}

/**
 * Nutrition adherence indicator
 */
const AdherenceIndicator = memo(function AdherenceIndicator({ percentage, className }: AdherenceIndicatorProps) {
    // Состояние — ролью: «отлично» — success, «хорошо» — info (сообщает, не
    // оценивает), «требует внимания» — warning, единственная оценочная роль.
    const getColor = (pct: number) => {
        if (pct >= 90) return 'text-success-fg bg-success-soft'
        if (pct >= 70) return 'text-info-fg bg-info-soft'
        return 'text-warning-fg bg-warning-soft'
    }

    const getLabel = (pct: number) => {
        if (pct >= 90) return t('dashboard.progress.excellent')
        if (pct >= 70) return t('dashboard.progress.good')
        return t('dashboard.progress.needsAttention')
    }

    return (
        <div className={cn('space-y-2', className)}>
            <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-fg">
                    {t('dashboard.progress.adherence')}
                </span>
                <span className={cn(
                    'rounded-full px-2.5 py-0.5 text-xs font-semibold',
                    getColor(percentage)
                )}>
                    {getLabel(percentage)}
                </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-track">
                <div
                    className={cn(
                        'h-full rounded-full transition-[width] duration-300 ease-standard',
                        percentage >= 90 ? 'bg-success' :
                            percentage >= 70 ? 'bg-info' :
                                'bg-warning'
                    )}
                    style={{ width: `${percentage}%` }}
                    role="progressbar"
                    aria-valuenow={percentage}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={t('dashboard.progress.adherenceAria', { percentage })}
                />
            </div>
            <div className="text-right type-caption text-fg-muted tabular-nums">
                {percentage.toFixed(1)}%
            </div>
        </div>
    )
})

/**
 * Achievement item component
 */
const AchievementItem = memo(function AchievementItem({ achievement }: { achievement: ProgressData['achievements'][0] }) {
    const achievedDate = new Date(achievement.achievedAt).toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'short',
    })

    return (
        <div className="flex min-h-14 items-start gap-3 py-3">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-subtle" aria-hidden="true">
                {achievement.icon ? (
                    // Значок приходит с сервера вместе с достижением — это
                    // содержимое, а не элемент интерфейса.
                    <span className="text-base">{achievement.icon}</span>
                ) : (
                    <Award className="h-4 w-4 text-fg-muted" strokeWidth={1.8} />
                )}
            </div>
            <div className="min-w-0 flex-1">
                <h5 className="truncate type-headline text-fg">{achievement.title}</h5>
                <p className="mt-0.5 text-sm text-fg-muted">{achievement.description}</p>
                <p className="mt-0.5 type-caption text-fg-subtle tabular-nums">{achievedDate}</p>
            </div>
        </div>
    )
})

/**
 * Placeholder when insufficient data
 */
const InsufficientDataPlaceholder = memo(function InsufficientDataPlaceholder() {
    return (
        <div className="flex flex-col items-center justify-center py-6 text-center" role="status">
            <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-subtle" aria-hidden="true">
                <Activity className="h-6 w-6 text-fg-subtle" strokeWidth={1.8} />
            </span>
            <h4 className="mb-1 type-title-3 text-fg">{t('dashboard.progress.notEnoughData')}</h4>
            <p className="text-sm text-fg-muted max-w-xs">
                {t('dashboard.progress.notEnoughDataHint')}
            </p>
        </div>
    )
})

/**
 * ProgressSection component
 */
export const ProgressSection = memo(function ProgressSection({ className }: ProgressSectionProps) {
    const [progressData, setProgressData] = useState<ProgressData | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    // Отдельно от «данных нет»: «недостаточно записей» — утверждение о том,
    // как человек вёл дневник, и говорить его, когда запрос упал, значит
    // врать ему про его же записи.
    const [loadError, setLoadError] = useState<string | null>(null)

    useEffect(() => {
        const fetchProgressData = async () => {
            setIsLoading(true)
            try {
                const raw = await apiClient.get<{
                    weight_trend: Array<{ date: string; weight: number }>
                    nutrition_adherence: number
                    target_weight: number | null
                }>('/api/v1/dashboard/progress?weeks=4')

                setLoadError(null)
                setProgressData({
                    weightTrend: (raw.weight_trend || []).map(p => ({
                        date: new Date(p.date),
                        weight: p.weight,
                    })),
                    nutritionAdherence: raw.nutrition_adherence || 0,
                    achievements: [],
                    targetWeight: raw.target_weight,
                })
            } catch (err) {
                setProgressData(null)
                setLoadError(messageForOr(err, t('dashboard.progress.loadFailed')))
            } finally {
                setIsLoading(false)
            }
        }

        fetchProgressData()
    }, [])

    const hasSufficientData = useMemo(() =>
        progressData && (
            progressData.nutritionAdherence > 0 ||
            progressData.achievements.length > 0
        ),
        [progressData]
    )

    return (
        <Card className={cn('h-full', className)}>
            <CardHeader>
                <CardTitle className="type-title-2 text-fg">
                    {t('dashboard.progress.title')}
                </CardTitle>
            </CardHeader>

            <CardContent className="space-y-6">
                {isLoading ? (
                    <div className="flex items-center justify-center py-8" role="status">
                        <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-primary" aria-hidden="true" />
                        <span className="sr-only">{t('common.loading')}</span>
                    </div>
                ) : loadError ? (
                    <p className="flex items-center justify-center gap-2 py-8 text-center text-sm text-danger-fg" role="status">
                        <AlertCircle className="h-4 w-4 flex-shrink-0" strokeWidth={1.8} aria-hidden="true" />
                        {loadError}
                    </p>
                ) : !hasSufficientData || !progressData ? (
                    <InsufficientDataPlaceholder />
                ) : (
                    <>
                        {/* Nutrition adherence */}
                        {progressData.nutritionAdherence > 0 && (
                            <div role="region" aria-label={t('dashboard.progress.adherence')}>
                                <AdherenceIndicator percentage={progressData.nutritionAdherence} />
                            </div>
                        )}

                        {/* Recent achievements */}
                        {progressData.achievements.length > 0 && (
                            <div role="region">
                                <h4 className="mb-1 type-overline text-fg-subtle">
                                    {t('dashboard.progress.achievements')}
                                </h4>
                                <div className="divide-y divide-line" role="list">
                                    {progressData.achievements.slice(0, 3).map((achievement) => (
                                        <div key={achievement.id} role="listitem">
                                            <AchievementItem achievement={achievement} />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </CardContent>
        </Card>
    )
})
