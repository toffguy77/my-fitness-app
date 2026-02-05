/**
 * NutritionBlock component for daily nutrition tracking
 *
 * Displays calorie goal and current intake, macro breakdown,
 * circular progress indicator, and quick add functionality.
 *
 * Requirements: 2.1, 2.2, 2.4, 2.5, 2.6
 */

import { useState } from 'react'
import { Plus, AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/Card'
import { Button } from '@/shared/components/ui/Button'
import { cn } from '@/shared/utils/cn'
import { useDashboardStore } from '../store/dashboardStore'
import { calculatePercentage } from '../utils/calculations'
import type { NutritionData } from '../types'

/**
 * Props for NutritionBlock component
 */
export interface NutritionBlockProps {
    date: Date
    className?: string
}

/**
 * Props for circular progress indicator
 */
interface CircularProgressProps {
    percentage: number
    size?: number
    strokeWidth?: number
    className?: string
    children?: React.ReactNode
}

/**
 * Circular progress indicator component
 */
function CircularProgress({
    percentage,
    size = 120,
    strokeWidth = 8,
    className,
    children,
}: CircularProgressProps) {
    const radius = (size - strokeWidth) / 2
    const circumference = radius * 2 * Math.PI
    const strokeDasharray = circumference
    const strokeDashoffset = circumference - (percentage / 100) * circumference

    // Determine color based on percentage
    const getColor = (pct: number) => {
        if (pct <= 50) return 'text-red-500'
        if (pct <= 80) return 'text-yellow-500'
        if (pct <= 100) return 'text-green-500'
        return 'text-orange-500' // Over 100%
    }

    const color = getColor(percentage)

    return (
        <div className={cn('relative inline-flex items-center justify-center', className)}>
            <svg
                width={size}
                height={size}
                className="transform -rotate-90"
                aria-hidden="true"
            >
                {/* Background circle */}
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke="currentColor"
                    strokeWidth={strokeWidth}
                    fill="none"
                    className="text-gray-200"
                />
                {/* Progress circle */}
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke="currentColor"
                    strokeWidth={strokeWidth}
                    fill="none"
                    strokeDasharray={strokeDasharray}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    className={cn('transition-all duration-300', color)}
                />
            </svg>
            {/* Content in center */}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                {children}
            </div>
        </div>
    )
}

/**
 * Props for macro progress bar
 */
interface MacroProgressBarProps {
    label: string
    current: number
    goal: number
    unit?: string
    className?: string
}

/**
 * Macro progress bar component
 */
function MacroProgressBar({
    label,
    current,
    goal,
    unit = 'г',
    className,
}: MacroProgressBarProps) {
    const percentage = calculatePercentage(current, goal)
    const isOverGoal = percentage > 100

    return (
        <div className={cn('space-y-1', className)}>
            <div className="flex justify-between text-sm">
                <span className="font-medium text-gray-700">{label}</span>
                <span className={cn(
                    'font-semibold',
                    isOverGoal ? 'text-orange-600' : 'text-gray-900'
                )}>
                    {current}{unit} / {goal}{unit}
                </span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
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
}

/**
 * NutritionBlock component
 */
export function NutritionBlock({ date, className }: NutritionBlockProps) {
    const [isNavigating, setIsNavigating] = useState(false)

    // Get data from store
    const { dailyData, weeklyPlan } = useDashboardStore()
    const dateStr = date.toISOString().split('T')[0]
    const dayData = dailyData[dateStr]

    // Get nutrition data and goals
    const nutrition = dayData?.nutrition || { calories: 0, protein: 0, fat: 0, carbs: 0 }
    const caloriesGoal = weeklyPlan?.caloriesGoal || 2000
    const proteinGoal = weeklyPlan?.proteinGoal || 150
    const fatGoal = weeklyPlan?.fatGoal || 67
    const carbsGoal = weeklyPlan?.carbsGoal || 250

    // Calculate percentages
    const caloriesPercentage = calculatePercentage(nutrition.calories, caloriesGoal)
    // Check raw values to avoid rounding issues (e.g., 2002/2001 = 100.05% rounds to 100.0%)
    const isOverCalorieGoal = nutrition.calories > caloriesGoal

    // Handle quick add navigation
    const handleQuickAdd = async () => {
        setIsNavigating(true)
        try {
            // Navigate to food tracker with selected date
            // This would typically use Next.js router
            window.location.href = `/food-tracker?date=${dateStr}`
        } catch (error) {
            console.error('Navigation failed:', error)
        } finally {
            setIsNavigating(false)
        }
    }

    return (
        <Card className={cn('h-full', className)} variant="bordered">
            <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-lg font-semibold text-gray-900">
                        Питание
                    </CardTitle>
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

            <CardContent className="space-y-6">
                {/* Circular progress for calories */}
                <div className="flex justify-center">
                    <CircularProgress
                        percentage={Math.min(caloriesPercentage, 150)} // Cap visual at 150%
                        size={120}
                        strokeWidth={8}
                    >
                        <div className="text-center">
                            <div className={cn(
                                'text-2xl font-bold',
                                isOverCalorieGoal ? 'text-orange-600' : 'text-gray-900'
                            )}>
                                {nutrition.calories}
                            </div>
                            <div className="text-sm text-gray-500">
                                из {caloriesGoal} ккал
                            </div>
                            <div className={cn(
                                'text-xs font-medium',
                                isOverCalorieGoal ? 'text-orange-600' : 'text-gray-600'
                            )}>
                                {caloriesPercentage.toFixed(1)}%
                            </div>
                        </div>
                    </CircularProgress>
                </div>

                {/* Warning when goal exceeded */}
                {isOverCalorieGoal && (
                    <div className="flex items-center gap-2 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                        <AlertTriangle className="h-4 w-4 text-orange-600 flex-shrink-0" />
                        <p className="text-sm text-orange-800">
                            Превышена дневная норма калорий
                        </p>
                    </div>
                )}

                {/* Macro breakdown */}
                <div className="space-y-4">
                    <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                        Макронутриенты
                    </h4>

                    <MacroProgressBar
                        label="Белки"
                        current={nutrition.protein}
                        goal={proteinGoal}
                        unit="г"
                    />

                    <MacroProgressBar
                        label="Жиры"
                        current={nutrition.fat}
                        goal={fatGoal}
                        unit="г"
                    />

                    <MacroProgressBar
                        label="Углеводы"
                        current={nutrition.carbs}
                        goal={carbsGoal}
                        unit="г"
                    />
                </div>

                {/* Empty state */}
                {nutrition.calories === 0 && (
                    <div className="text-center py-4">
                        <p className="text-sm text-gray-500 mb-3">
                            Данные о питании не добавлены
                        </p>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleQuickAdd}
                            isLoading={isNavigating}
                            className="text-blue-600 border-blue-200 hover:bg-blue-50"
                        >
                            <Plus className="h-4 w-4 mr-2" />
                            Добавить еду
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
