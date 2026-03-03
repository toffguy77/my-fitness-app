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
        if (pct >= 90) return 'text-green-600 bg-green-50 border-green-200'
        if (pct >= 70) return 'text-yellow-600 bg-yellow-50 border-yellow-200'
        return 'text-orange-600 bg-orange-50 border-orange-200'
    }

    const getLabel = (pct: number) => {
        if (pct >= 90) return 'Отлично'
        if (pct >= 70) return 'Хорошо'
        return 'Требует внимания'
    }

    return (
        <div className={cn('space-y-2', className)}>
            <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">
                    Соблюдение плана питания
                </span>
                <span className={cn(
                    'text-sm font-semibold px-2 py-1 rounded-full border',
                    getColor(percentage)
                )}>
                    {getLabel(percentage)}
                </span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                    className={cn(
                        'h-full transition-all duration-300 rounded-full',
                        percentage >= 90 ? 'bg-green-500' :
                            percentage >= 70 ? 'bg-yellow-500' :
                                'bg-orange-500'
                    )}
                    style={{ width: `${percentage}%` }}
                    role="progressbar"
                    aria-valuenow={percentage}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Соблюдение плана питания: ${percentage}%`}
                />
            </div>
            <div className="text-xs text-gray-500 text-right">
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
        <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex-shrink-0 w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center" aria-hidden="true">
                {achievement.icon ? (
                    <span className="text-white text-lg">{achievement.icon}</span>
                ) : (
                    <Award className="h-4 w-4 text-white" />
                )}
            </div>
            <div className="flex-1 min-w-0">
                <h5 className="text-sm font-semibold text-gray-900 truncate">{achievement.title}</h5>
                <p className="text-xs text-gray-600 mt-0.5">{achievement.description}</p>
                <p className="text-xs text-gray-500 mt-1">{achievedDate}</p>
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
            <Activity className="h-12 w-12 text-gray-300 mb-3" aria-hidden="true" />
            <h4 className="text-sm font-semibold text-gray-700 mb-1">Недостаточно данных</h4>
            <p className="text-sm text-gray-500 max-w-xs">
                Продолжайте отслеживать свой прогресс, чтобы увидеть статистику
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

    useEffect(() => {
        const fetchProgressData = async () => {
            setIsLoading(true)
            try {
                const raw = await apiClient.get<{
                    weight_trend: Array<{ date: string; weight: number }>
                    nutrition_adherence: number
                    target_weight: number | null
                }>('/backend-api/v1/dashboard/progress?weeks=4')

                setProgressData({
                    weightTrend: (raw.weight_trend || []).map(p => ({
                        date: new Date(p.date),
                        weight: p.weight,
                    })),
                    nutritionAdherence: raw.nutrition_adherence || 0,
                    achievements: [],
                    targetWeight: raw.target_weight,
                })
            } catch {
                setProgressData(null)
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
            <CardHeader className="pb-4">
                <CardTitle className="text-lg font-semibold text-gray-900">
                    Прогресс
                </CardTitle>
            </CardHeader>

            <CardContent className="space-y-6">
                {isLoading ? (
                    <div className="flex items-center justify-center py-8" role="status">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" aria-hidden="true" />
                        <span className="sr-only">Загрузка...</span>
                    </div>
                ) : !hasSufficientData || !progressData ? (
                    <InsufficientDataPlaceholder />
                ) : (
                    <>
                        {/* Nutrition adherence */}
                        {progressData.nutritionAdherence > 0 && (
                            <div role="region" aria-label="Соблюдение плана питания">
                                <AdherenceIndicator percentage={progressData.nutritionAdherence} />
                            </div>
                        )}

                        {/* Recent achievements */}
                        {progressData.achievements.length > 0 && (
                            <div className="space-y-3" role="region">
                                <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                                    Недавние достижения
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
