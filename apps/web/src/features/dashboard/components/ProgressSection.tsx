/**
 * ProgressSection component for displaying long-term progress
 *
 * Displays weight trend chart (last 4 weeks), nutrition adherence percentage,
 * recent achievements, and navigation to analytics page.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 *
 * Performance optimizations:
 * - React.memo to prevent unnecessary re-renders
 * - Memoized sub-components (WeightTrendChart, AdherenceIndicator, AchievementItem)
 * - Throttled resize handler for chart responsiveness
 */

import { useState, useEffect, memo, useMemo, useCallback } from 'react'
import { TrendingUp, Award, ChevronRight, Activity } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/Card'
import { Button } from '@/shared/components/ui/Button'
import { cn } from '@/shared/utils/cn'
import { useThrottledCallback } from '@/shared/hooks/useThrottle'
import type { ProgressData } from '../types'

/**
 * Props for ProgressSection component
 */
export interface ProgressSectionProps {
    className?: string
}

/**
 * Props for weight trend chart
 */
interface WeightTrendChartProps {
    data: ProgressData['weightTrend']
    className?: string
}

/**
 * Simple line chart for weight trend
 * Memoized to prevent unnecessary re-renders
 */
const WeightTrendChart = memo(function WeightTrendChart({ data, className }: WeightTrendChartProps) {
    // Calculate chart dimensions - responsive
    const width = 300
    const height = 120
    const padding = { top: 10, right: 10, bottom: 20, left: 40 }
    const chartWidth = width - padding.left - padding.right
    const chartHeight = height - padding.top - padding.bottom

    // Find min and max weights - memoized
    const { minWeight, maxWeight, weightRange } = useMemo(() => {
        if (data.length === 0) {
            return { minWeight: 0, maxWeight: 0, weightRange: 1 }
        }
        const weights = data.map(d => d.weight)
        const min = Math.min(...weights)
        const max = Math.max(...weights)
        return {
            minWeight: min,
            maxWeight: max,
            weightRange: max - min || 1 // Avoid division by zero
        }
    }, [data])

    // Create points for the line - memoized
    const points = useMemo(() => {
        if (data.length === 0) return []
        return data.map((point, index) => {
            const x = padding.left + (index / (data.length - 1)) * chartWidth
            const y = padding.top + chartHeight - ((point.weight - minWeight) / weightRange) * chartHeight
            return { x, y, weight: point.weight, date: point.date }
        })
    }, [data, minWeight, weightRange, chartWidth, chartHeight])

    // Create path for the line - memoized
    const pathData = useMemo(() =>
        points.map((p, i) =>
            `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`
        ).join(' '),
        [points]
    )

    // Early return after all hooks
    if (data.length === 0) {
        return null
    }

    return (
        <div className={cn('relative w-full', className)}>
            <svg
                viewBox={`0 0 ${width} ${height}`}
                className="w-full h-auto max-w-full"
                preserveAspectRatio="xMidYMid meet"
                aria-label="График изменения веса за последние 4 недели"
            >
                {/* Grid lines */}
                <line
                    x1={padding.left}
                    y1={padding.top + chartHeight / 2}
                    x2={width - padding.right}
                    y2={padding.top + chartHeight / 2}
                    stroke="currentColor"
                    strokeWidth="1"
                    strokeDasharray="4 4"
                    className="text-gray-200"
                />

                {/* Line */}
                <path
                    d={pathData}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-blue-500"
                />

                {/* Points */}
                {points.map((point, index) => (
                    <circle
                        key={index}
                        cx={point.x}
                        cy={point.y}
                        r="4"
                        fill="currentColor"
                        className="text-blue-500"
                    >
                        <title>{`${point.weight.toFixed(1)} кг`}</title>
                    </circle>
                ))}

                {/* Y-axis labels */}
                <text
                    x={padding.left - 5}
                    y={padding.top}
                    textAnchor="end"
                    className="text-xs fill-gray-500"
                >
                    {maxWeight.toFixed(1)}
                </text>
                <text
                    x={padding.left - 5}
                    y={padding.top + chartHeight}
                    textAnchor="end"
                    className="text-xs fill-gray-500"
                >
                    {minWeight.toFixed(1)}
                </text>
            </svg>

            {/* Weight change indicator */}
            {data.length >= 2 && (
                <div className="mt-2 text-center">
                    {(() => {
                        const firstWeight = data[0].weight
                        const lastWeight = data[data.length - 1].weight
                        const change = lastWeight - firstWeight
                        const isDecrease = change < 0

                        return (
                            <div className={cn(
                                'inline-flex items-center gap-1 text-sm font-medium',
                                isDecrease ? 'text-green-600' : change > 0 ? 'text-orange-600' : 'text-gray-600'
                            )}>
                                <TrendingUp className={cn(
                                    'h-4 w-4',
                                    isDecrease && 'rotate-180'
                                )} />
                                <span>
                                    {isDecrease ? '' : '+'}{change.toFixed(1)} кг за 4 недели
                                </span>
                            </div>
                        )
                    })()}
                </div>
            )}
        </div>
    )
})

/**
 * Props for adherence indicator
 */
interface AdherenceIndicatorProps {
    percentage: number
    className?: string
}

/**
 * Nutrition adherence indicator
 * Memoized to prevent unnecessary re-renders
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
 * Props for achievement item
 */
interface AchievementItemProps {
    achievement: ProgressData['achievements'][0]
    className?: string
}

/**
 * Achievement item component
 * Memoized to prevent unnecessary re-renders
 */
const AchievementItem = memo(function AchievementItem({ achievement, className }: AchievementItemProps) {
    const achievedDate = new Date(achievement.achievedAt).toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'short',
    })

    return (
        <div
            className={cn('flex items-start gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg', className)}
            role="article"
            aria-label={`Достижение: ${achievement.title}. ${achievement.description}. Получено ${achievedDate}`}
        >
            <div className="flex-shrink-0 w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center" aria-hidden="true">
                {achievement.icon ? (
                    <span className="text-white text-lg">{achievement.icon}</span>
                ) : (
                    <Award className="h-4 w-4 text-white" />
                )}
            </div>
            <div className="flex-1 min-w-0">
                <h5 className="text-sm font-semibold text-gray-900 truncate">
                    {achievement.title}
                </h5>
                <p className="text-xs text-gray-600 mt-0.5">
                    {achievement.description}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                    {achievedDate}
                </p>
            </div>
        </div>
    )
})

/**
 * Placeholder component when insufficient data
 * Memoized to prevent unnecessary re-renders
 */
const InsufficientDataPlaceholder = memo(function InsufficientDataPlaceholder() {
    return (
        <div
            className="flex flex-col items-center justify-center py-8 text-center"
            role="status"
            aria-label="Недостаточно данных для отображения прогресса"
        >
            <Activity className="h-12 w-12 text-gray-300 mb-3" aria-hidden="true" />
            <h4 className="text-sm font-semibold text-gray-700 mb-1">
                Недостаточно данных
            </h4>
            <p className="text-sm text-gray-500 max-w-xs">
                Продолжайте отслеживать свой прогресс, чтобы увидеть тренды и достижения
            </p>
        </div>
    )
})

/**
 * ProgressSection component
 * Wrapped with React.memo to prevent unnecessary re-renders
 */
export const ProgressSection = memo(function ProgressSection({ className }: ProgressSectionProps) {
    const [progressData, setProgressData] = useState<ProgressData | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [isNavigating, setIsNavigating] = useState(false)

    // Fetch progress data
    useEffect(() => {
        const fetchProgressData = async () => {
            setIsLoading(true)
            try {
                // TODO: Replace with actual API call
                // const response = await apiClient.get('/dashboard/progress?weeks=4')
                // setProgressData(response.data)

                // Mock data for now
                await new Promise(resolve => setTimeout(resolve, 500))

                // Simulate empty data for placeholder
                setProgressData({
                    weightTrend: [],
                    nutritionAdherence: 0,
                    achievements: [],
                })
            } catch (error) {
                console.error('Failed to fetch progress data:', error)
                setProgressData(null)
            } finally {
                setIsLoading(false)
            }
        }

        fetchProgressData()
    }, [])

    // Handle navigation to analytics - memoized
    const handleNavigateToAnalytics = useCallback(async () => {
        setIsNavigating(true)
        try {
            // Navigate to analytics page
            window.location.href = '/analytics'
        } catch (error) {
            console.error('Navigation failed:', error)
        } finally {
            setIsNavigating(false)
        }
    }, [])

    // Check if we have sufficient data - memoized
    const hasSufficientData = useMemo(() =>
        progressData && (
            progressData.weightTrend.length >= 3 ||
            progressData.nutritionAdherence > 0 ||
            progressData.achievements.length > 0
        ),
        [progressData]
    )

    return (
        <Card className={cn('h-full', className)} variant="bordered">
            <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-lg font-semibold text-gray-900">
                        Прогресс
                    </CardTitle>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleNavigateToAnalytics}
                        isLoading={isNavigating}
                        className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                        aria-label="Перейти к аналитике"
                    >
                        <span className="text-sm">Подробнее</span>
                        <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                </div>
            </CardHeader>

            <CardContent className="space-y-6">
                {isLoading ? (
                    <div
                        className="flex items-center justify-center py-8"
                        role="status"
                        aria-label="Загрузка данных прогресса"
                    >
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" aria-hidden="true" />
                        <span className="sr-only">Загрузка...</span>
                    </div>
                ) : !hasSufficientData || !progressData ? (
                    <InsufficientDataPlaceholder />
                ) : (
                    <>
                        {/* Weight trend chart */}
                        {progressData.weightTrend.length >= 3 && (
                            <div className="space-y-2" role="region" aria-labelledby="weight-trend-heading">
                                <h4 id="weight-trend-heading" className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                                    Динамика веса
                                </h4>
                                <WeightTrendChart data={progressData.weightTrend} />
                            </div>
                        )}

                        {/* Nutrition adherence */}
                        {progressData.nutritionAdherence > 0 && (
                            <div role="region" aria-label="Соблюдение плана питания">
                                <AdherenceIndicator percentage={progressData.nutritionAdherence} />
                            </div>
                        )}

                        {/* Recent achievements */}
                        {progressData.achievements.length > 0 && (
                            <div className="space-y-3" role="region" aria-labelledby="achievements-heading">
                                <h4 id="achievements-heading" className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                                    Недавние достижения
                                </h4>
                                <div className="space-y-2" role="list">
                                    {progressData.achievements.slice(0, 3).map((achievement) => (
                                        <div key={achievement.id} role="listitem">
                                            <AchievementItem achievement={achievement} />
                                        </div>
                                    ))}
                                </div>
                                {progressData.achievements.length > 3 && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={handleNavigateToAnalytics}
                                        isLoading={isNavigating}
                                        className="w-full text-blue-600 border-blue-200 hover:bg-blue-50"
                                        aria-label="Показать все достижения"
                                    >
                                        Показать все достижения
                                    </Button>
                                )}
                            </div>
                        )}
                    </>
                )}
            </CardContent>
        </Card>
    )
})
