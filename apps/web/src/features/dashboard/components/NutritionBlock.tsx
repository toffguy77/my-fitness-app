/**
 * NutritionBlock component for daily nutrition tracking
 *
 * Compact segmented ring design showing calorie progress in center
 * with color-coded macro segments (protein, fat, carbs).
 *
 * Requirements: 2.1, 2.2, 2.4, 2.5, 2.6
 *
 * Performance optimizations:
 * - React.memo to prevent unnecessary re-renders
 * - Memoized sub-components (SegmentedRing, MacroProgressBar)
 */

import { useState, memo, useMemo } from 'react'
import { Plus, AlertTriangle, UtensilsCrossed } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/Card'
import { Button } from '@/shared/components/ui/Button'
import { cn } from '@/shared/utils/cn'
import { useDashboardStore } from '../store/dashboardStore'
import { calculatePercentage } from '../utils/calculations'
import { formatLocalDate } from '@/shared/utils/format'
import { AttentionBadge } from './AttentionBadge'

/**
 * Props for NutritionBlock component
 */
export interface NutritionBlockProps {
    date: Date
    className?: string
}

// Macro colors matching the ring segments
const MACRO_COLORS = {
    protein: '#3b82f6', // blue-500
    fat: '#f59e0b',     // amber-500
    carbs: '#22c55e',   // green-500
}

/**
 * Segment data for the ring
 */
interface Segment {
    percentage: number
    color: string
    label: string
}

/**
 * Props for segmented ring indicator
 */
interface SegmentedRingProps {
    size?: number
    strokeWidth?: number
    segments: Segment[]
    className?: string
    children?: React.ReactNode
}

/**
 * Segmented ring progress indicator
 * Three colored arcs for protein/fat/carbs, each filling proportionally
 * Memoized to prevent unnecessary re-renders
 */
const SegmentedRing = memo(function SegmentedRing({
    size = 88,
    strokeWidth = 7,
    segments,
    className,
    children,
}: SegmentedRingProps) {
    const radius = (size - strokeWidth) / 2
    const circumference = 2 * Math.PI * radius
    const gapLength = 4
    const segmentMax = (circumference - segments.length * gapLength) / segments.length

    return (
        <div
            className={cn('relative inline-flex items-center justify-center', className)}
            role="img"
            aria-label="Прогресс макронутриентов"
        >
            <svg
                width={size}
                height={size}
                className="transform -rotate-90"
                aria-hidden="true"
            >
                {/* Background track */}
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke="currentColor"
                    strokeWidth={strokeWidth}
                    fill="none"
                    className="text-gray-100"
                />
                {/* Colored segments */}
                {segments.map((seg, i) => {
                    const startOffset = i * (segmentMax + gapLength)
                    const filledLength = Math.min(seg.percentage / 100, 1) * segmentMax
                    if (filledLength <= 0) return null
                    return (
                        <circle
                            key={seg.label}
                            cx={size / 2}
                            cy={size / 2}
                            r={radius}
                            stroke={seg.color}
                            strokeWidth={strokeWidth}
                            fill="none"
                            strokeLinecap="round"
                            strokeDasharray={`${filledLength} ${circumference - filledLength}`}
                            strokeDashoffset={-startOffset}
                            className="transition-all duration-500"
                        />
                    )
                })}
            </svg>
            {/* Center content */}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                {children}
            </div>
        </div>
    )
})

/**
 * Props for macro progress bar
 */
interface MacroProgressBarProps {
    label: string
    current: number
    goal: number
    unit?: string
    color: string
    className?: string
}

/**
 * Compact macro progress bar with colored dot indicator
 * Memoized to prevent unnecessary re-renders
 */
const MacroProgressBar = memo(function MacroProgressBar({
    label,
    current,
    goal,
    unit = 'г',
    color,
    className,
}: MacroProgressBarProps) {
    const percentage = calculatePercentage(current, goal)
    const isOverGoal = percentage > 100

    return (
        <div className={cn('space-y-1', className)}>
            <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-gray-700 flex items-center gap-1.5">
                    <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: color }}
                        aria-hidden="true"
                    />
                    {label}
                </span>
                <span className={cn(
                    'font-semibold',
                    isOverGoal ? 'text-orange-600' : 'text-gray-900'
                )}>
                    {current}{unit} / {goal}{unit}
                </span>
            </div>
            <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                    className={cn(
                        'h-full transition-all duration-300 rounded-full',
                        percentage <= 100 ? 'bg-blue-500' : 'bg-orange-500'
                    )}
                    style={{ width: `${Math.min(percentage, 100)}%` }}
                    role="progressbar"
                    aria-valuenow={current}
                    aria-valuemin={0}
                    aria-valuemax={goal}
                    aria-label={`${label}: ${current} из ${goal} ${unit}`}
                />
            </div>
            <div className="text-xs text-gray-500 text-right">
                {percentage.toFixed(1)}%
            </div>
        </div>
    )
})

/**
 * NutritionBlock component
 * Wrapped with React.memo to prevent unnecessary re-renders when props haven't changed
 */
export const NutritionBlock = memo(function NutritionBlock({ date, className }: NutritionBlockProps) {
    const [isNavigating, setIsNavigating] = useState(false)

    // Get data from store
    const { dailyData, weeklyPlan } = useDashboardStore()
    const dateStr = formatLocalDate(date)
    const dayData = dailyData[dateStr]

    // Get nutrition data and goals - memoized to prevent recalculation
    const nutrition = useMemo(() =>
        dayData?.nutrition || { calories: 0, protein: 0, fat: 0, carbs: 0 },
        [dayData?.nutrition]
    )

    const goals = useMemo(() => ({
        caloriesGoal: weeklyPlan?.caloriesGoal || 2000,
        proteinGoal: weeklyPlan?.proteinGoal || 150,
        fatGoal: weeklyPlan?.fatGoal || 67,
        carbsGoal: weeklyPlan?.carbsGoal || 250,
    }), [weeklyPlan?.caloriesGoal, weeklyPlan?.proteinGoal, weeklyPlan?.fatGoal, weeklyPlan?.carbsGoal])

    // Calculate percentages
    const caloriesPercentage = calculatePercentage(nutrition.calories, goals.caloriesGoal)
    const isOverCalorieGoal = nutrition.calories > goals.caloriesGoal

    // Determine calorie text color based on percentage
    const getCalorieColor = (pct: number) => {
        if (pct <= 50) return 'text-red-500'
        if (pct <= 80) return 'text-yellow-500'
        if (pct <= 100) return 'text-green-500'
        return 'text-orange-500'
    }

    // Ring segments for macros
    const segments = useMemo<Segment[]>(() => [
        { percentage: calculatePercentage(nutrition.protein, goals.proteinGoal), color: MACRO_COLORS.protein, label: 'protein' },
        { percentage: calculatePercentage(nutrition.fat, goals.fatGoal), color: MACRO_COLORS.fat, label: 'fat' },
        { percentage: calculatePercentage(nutrition.carbs, goals.carbsGoal), color: MACRO_COLORS.carbs, label: 'carbs' },
    ], [nutrition.protein, nutrition.fat, nutrition.carbs, goals.proteinGoal, goals.fatGoal, goals.carbsGoal])

    // Handle quick add navigation
    const handleQuickAdd = async () => {
        setIsNavigating(true)
        try {
            window.location.href = `/food-tracker?date=${dateStr}`
        } catch (error) {
            console.error('Navigation failed:', error)
        } finally {
            setIsNavigating(false)
        }
    }

    // Check if this is today and nutrition is not logged
    const isToday = dateStr === formatLocalDate(new Date())
    const showAttentionIndicator = isToday && nutrition.calories === 0

    return (
        <Card className={cn('h-full', className)} variant="bordered">
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <CardTitle className="text-base font-semibold text-gray-900">
                            Питание
                        </CardTitle>
                        {showAttentionIndicator && (
                            <AttentionBadge
                                urgency="normal"
                                ariaLabel="Питание не записано сегодня"
                            />
                        )}
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleQuickAdd}
                        isLoading={isNavigating}
                        className="h-8 w-8 p-0"
                        aria-label="Добавить еду"
                    >
                        <Plus className="h-4 w-4" />
                    </Button>
                </div>
            </CardHeader>

            <CardContent className="space-y-3">
                {/* Segmented ring for macro progress */}
                <div className="flex justify-center">
                    <SegmentedRing
                        size={88}
                        strokeWidth={7}
                        segments={segments}
                    >
                        <div className="text-center">
                            <div className={cn(
                                'text-lg font-bold',
                                getCalorieColor(caloriesPercentage)
                            )} data-testid="calorie-value">
                                {nutrition.calories}
                            </div>
                            <div className="text-[10px] text-gray-500 leading-tight">
                                из {goals.caloriesGoal} ккал
                            </div>
                            <div className={cn(
                                'text-[10px] font-medium',
                                isOverCalorieGoal ? 'text-orange-600' : 'text-gray-600'
                            )}>
                                {caloriesPercentage.toFixed(1)}%
                            </div>
                        </div>
                    </SegmentedRing>
                </div>

                {/* Warning when goal exceeded */}
                {isOverCalorieGoal && (
                    <div
                        className="flex items-center gap-2 p-2 bg-orange-50 border border-orange-200 rounded-lg"
                        role="alert"
                        aria-live="polite"
                    >
                        <AlertTriangle className="h-3.5 w-3.5 text-orange-600 flex-shrink-0" aria-hidden="true" />
                        <p className="text-xs text-orange-800">
                            Превышена дневная норма калорий
                        </p>
                    </div>
                )}

                {/* Macro breakdown - compact */}
                <div className="space-y-2">
                    <MacroProgressBar
                        label="Белки"
                        current={nutrition.protein}
                        goal={goals.proteinGoal}
                        unit="г"
                        color={MACRO_COLORS.protein}
                    />

                    <MacroProgressBar
                        label="Жиры"
                        current={nutrition.fat}
                        goal={goals.fatGoal}
                        unit="г"
                        color={MACRO_COLORS.fat}
                    />

                    <MacroProgressBar
                        label="Углеводы"
                        current={nutrition.carbs}
                        goal={goals.carbsGoal}
                        unit="г"
                        color={MACRO_COLORS.carbs}
                    />
                </div>

                {/* Empty state */}
                {nutrition.calories === 0 && (
                    <div className="text-center py-2 space-y-2">
                        <UtensilsCrossed className="h-8 w-8 mx-auto text-gray-300" aria-hidden="true" />
                        <p className="text-sm text-gray-500">Не записано</p>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleQuickAdd}
                            isLoading={isNavigating}
                            className="text-blue-600 border-blue-200 hover:bg-blue-50"
                            aria-label="Добавить еду в дневник питания"
                        >
                            <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
                            Добавить
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    )
})
