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
import { Award, Activity } from 'lucide-react'
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
    const getColor = (pct: number) => {
        if (pct >= 90) return 'text-success-fg bg-success-soft border-success/30'
        if (pct >= 70) return 'text-warning-fg bg-warning-soft border-warning/30'
        return 'text-warning-fg bg-warning-soft border-warning/30'
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
                    'text-sm font-semibold px-2 py-1 rounded-full border',
                    getColor(percentage)
                )}>
                    {getLabel(percentage)}
                </span>
            </div>
            <div className="h-1.5 bg-subtle rounded-full overflow-hidden">
                <div
                    className={cn(
                        'h-full transition-all duration-300 rounded-full',
                        percentage >= 90 ? 'bg-success' :
                            percentage >= 70 ? 'bg-warning' :
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
            <div className="text-xs text-fg-muted text-right">
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
        <div className="flex items-start gap-3 p-3 bg-primary-soft border border-primary/30 rounded-lg">
            <div className="flex-shrink-0 w-8 h-8 bg-primary rounded-full flex items-center justify-center" aria-hidden="true">
                {achievement.icon ? (
                    <span className="text-on-primary text-lg">{achievement.icon}</span>
                ) : (
                    <Award className="h-4 w-4 text-on-primary" />
                )}
            </div>
            <div className="flex-1 min-w-0">
                <h5 className="text-sm font-semibold text-fg truncate">{achievement.title}</h5>
                <p className="text-xs text-fg-muted mt-0.5">{achievement.description}</p>
                <p className="text-xs text-fg-muted mt-1">{achievedDate}</p>
            </div>
        </div>
    )
})

/**
 * Placeholder when insufficient data
 */
const InsufficientDataPlaceholder = memo(function InsufficientDataPlaceholder() {
    return (
        <div className="flex flex-col items-center justify-center py-8 text-center" role="status">
            <Activity className="h-12 w-12 text-fg-subtle mb-3" aria-hidden="true" />
            <h4 className="text-sm font-semibold text-fg mb-1">{t('dashboard.progress.notEnoughData')}</h4>
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
        <Card className={cn('h-full', className)} variant="bordered">
            <CardHeader className="pb-3">
                <CardTitle className="text-lg font-semibold text-fg">
                    {t('dashboard.progress.title')}
                </CardTitle>
            </CardHeader>

            <CardContent className="space-y-6">
                {isLoading ? (
                    <div className="flex items-center justify-center py-8" role="status">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" aria-hidden="true" />
                        <span className="sr-only">{t('common.loading')}</span>
                    </div>
                ) : loadError ? (
                    <p className="py-8 text-center text-sm text-danger-fg" role="status">{loadError}</p>
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
                            <div className="space-y-3" role="region">
                                <h4 className="text-sm font-semibold text-fg uppercase tracking-wide">
                                    {t('dashboard.progress.achievements')}
                                </h4>
                                <div className="space-y-2" role="list">
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
