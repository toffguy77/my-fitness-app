/**
 * StepsBlock component for daily steps tracking
 *
 * Compact ring display showing step progress with centered count,
 * quick add functionality, completion indicator, and validation.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.6, 4.7
 *
 * Performance optimizations:
 * - React.memo to prevent unnecessary re-renders
 * - Memoized StepsRing sub-component
 * - Debounced input validation (300ms)
 */

import { useState, useCallback, memo, useMemo } from 'react'
import { Plus, Check, Target } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/Card'
import { Button } from '@/shared/components/ui/Button'
import { Input } from '@/shared/components/ui/Input'
import { cn } from '@/shared/utils/cn'
import { useDashboardStore } from '../store/dashboardStore'
import { validateSteps } from '../utils/validation'
import { calculatePercentage } from '../utils/calculations'
import { useDebouncedCallback } from '@/shared/hooks/useDebounce'
import { AttentionBadge } from './AttentionBadge'
import toast from 'react-hot-toast'

/**
 * Props for StepsBlock component
 */
export interface StepsBlockProps {
    date: Date
    className?: string
}

/**
 * Props for steps ring component
 */
interface StepsRingProps {
    percentage: number
    size?: number
    strokeWidth?: number
    className?: string
    children?: React.ReactNode
}

/**
 * Circular progress ring for steps
 * Memoized to prevent unnecessary re-renders
 */
const StepsRing = memo(function StepsRing({
    percentage,
    size = 72,
    strokeWidth = 6,
    className,
    children,
}: StepsRingProps) {
    const radius = (size - strokeWidth) / 2
    const circumference = radius * 2 * Math.PI
    const cappedPercentage = Math.min(percentage, 100)
    const strokeDashoffset = circumference - (cappedPercentage / 100) * circumference
    const isComplete = percentage >= 100

    return (
        <div
            className={cn('relative inline-flex items-center justify-center', className)}
            role="progressbar"
            aria-valuenow={cappedPercentage}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Прогресс шагов: ${percentage.toFixed(1)}%`}
        >
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
                    className="text-gray-100"
                />
                {/* Progress circle */}
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke="currentColor"
                    strokeWidth={strokeWidth}
                    fill="none"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    className={cn(
                        'transition-all duration-500',
                        isComplete ? 'text-green-500' : 'text-blue-500'
                    )}
                />
            </svg>
            {/* Center content */}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                {children}
            </div>
        </div>
    )
})

/**
 * StepsBlock component
 * Wrapped with React.memo to prevent unnecessary re-renders
 */
export const StepsBlock = memo(function StepsBlock({ date, className }: StepsBlockProps) {
    const [inputValue, setInputValue] = useState('')
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [validationError, setValidationError] = useState<string | null>(null)

    // Get data from store
    const { dailyData, weeklyPlan, updateMetric } = useDashboardStore()
    const dateStr = date.toISOString().split('T')[0]
    const dayData = dailyData[dateStr]

    // Get current steps and goal
    const currentSteps = dayData?.steps || 0
    const stepsGoal = weeklyPlan?.stepsGoal || 10000

    // Calculate percentage and completion - memoized
    const { percentage, isGoalReached } = useMemo(() => ({
        percentage: calculatePercentage(currentSteps, stepsGoal),
        isGoalReached: currentSteps >= stepsGoal,
    }), [currentSteps, stepsGoal])

    // Format steps display
    const formatSteps = (steps: number) => {
        if (steps >= 1000) {
            return `${(steps / 1000).toFixed(1)}k`
        }
        return steps.toString()
    }

    // Debounced validation function (300ms delay)
    const debouncedValidate = useDebouncedCallback((value: string) => {
        if (value.trim() === '') {
            setValidationError(null)
            return
        }

        const numericValue = parseInt(value, 10)
        const validation = validateSteps(numericValue)

        if (!validation.isValid) {
            setValidationError(validation.error || 'Неверное значение')
        } else {
            setValidationError(null)
        }
    }, 300)

    // Handle input change with debounced validation
    const handleInputChange = useCallback((value: string) => {
        setInputValue(value)
        // Clear error immediately for better UX, then validate after debounce
        if (validationError) {
            setValidationError(null)
        }
        debouncedValidate(value)
    }, [debouncedValidate, validationError])

    // Handle save steps
    const handleSave = useCallback(async () => {
        if (!inputValue.trim()) {
            setValidationError('Введите количество шагов')
            return
        }

        const numericValue = parseInt(inputValue, 10)
        const validation = validateSteps(numericValue)

        if (!validation.isValid) {
            setValidationError(validation.error || 'Неверное значение')
            return
        }

        setIsSaving(true)
        setValidationError(null)

        try {
            await updateMetric(dateStr, {
                type: 'steps',
                data: { steps: numericValue }
            })

            setInputValue('')
            setIsDialogOpen(false)
            toast.success('Шаги сохранены')
        } catch (error) {
            console.error('Failed to save steps:', error)
            setValidationError('Не удалось сохранить шаги')
        } finally {
            setIsSaving(false)
        }
    }, [inputValue, dateStr, updateMetric])

    // Handle quick add button
    const handleQuickAdd = useCallback(() => {
        setInputValue(currentSteps.toString())
        setIsDialogOpen(true)
    }, [currentSteps])

    // Handle cancel dialog
    const handleCancel = useCallback(() => {
        setInputValue('')
        setIsDialogOpen(false)
        setValidationError(null)
    }, [])

    // Handle key press
    const handleKeyPress = useCallback((event: React.KeyboardEvent) => {
        if (event.key === 'Enter') {
            handleSave()
        } else if (event.key === 'Escape') {
            handleCancel()
        }
    }, [handleSave, handleCancel])

    // Check if this is today and steps are not logged
    const isToday = dateStr === new Date().toISOString().split('T')[0]
    const showAttentionIndicator = isToday && currentSteps === 0

    return (
        <Card className={cn('h-full', className)} variant="bordered">
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <CardTitle className="text-base font-semibold text-gray-900">
                            Шаги
                        </CardTitle>
                        {showAttentionIndicator && (
                            <AttentionBadge
                                urgency="normal"
                                ariaLabel="Шаги не записаны сегодня"
                            />
                        )}
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleQuickAdd}
                        className="h-8 w-8 p-0"
                        aria-label="Добавить шаги"
                    >
                        <Plus className="h-4 w-4" />
                    </Button>
                </div>
            </CardHeader>

            <CardContent className="space-y-3">
                {/* Steps ring display */}
                <div className="text-center space-y-2" role="region" aria-label="Прогресс шагов">
                    <div className="flex justify-center">
                        <StepsRing percentage={percentage} size={72} strokeWidth={6}>
                            <span
                                className={cn(
                                    'text-base font-bold leading-tight',
                                    isGoalReached ? 'text-green-600' : 'text-gray-900'
                                )}
                                aria-label={`Текущее количество шагов: ${currentSteps.toLocaleString()}`}
                            >
                                {formatSteps(currentSteps)}
                            </span>
                        </StepsRing>
                    </div>
                    <div className="space-y-0.5">
                        <div className="text-xs text-gray-500" aria-label={`Цель: ${stepsGoal.toLocaleString()} шагов`}>
                            из {formatSteps(stepsGoal)} шагов
                        </div>
                        <div className={cn(
                            'text-xs font-medium',
                            isGoalReached ? 'text-green-600' : 'text-gray-600'
                        )}>
                            {percentage.toFixed(1)}%
                        </div>
                    </div>

                    {/* Completion indicator */}
                    {isGoalReached && (
                        <div
                            className="flex items-center justify-center gap-1.5 text-green-600"
                            role="status"
                            aria-label="Цель по шагам достигнута"
                        >
                            <Check className="h-3.5 w-3.5" aria-hidden="true" />
                            <span className="text-xs font-medium">Цель достигнута!</span>
                        </div>
                    )}
                </div>

                {/* Input dialog */}
                {isDialogOpen && (
                    <div className="space-y-2.5 p-3 bg-gray-50 rounded-lg border" role="dialog" aria-labelledby="steps-dialog-title">
                        <div id="steps-dialog-title" className="flex items-center gap-2 text-sm font-medium text-gray-700">
                            <Target className="h-4 w-4" aria-hidden="true" />
                            <span>Обновить количество шагов</span>
                        </div>

                        <div>
                            <label htmlFor="steps-input" className="sr-only">
                                Количество шагов
                            </label>
                            <Input
                                id="steps-input"
                                type="number"
                                min="0"
                                max="100000"
                                placeholder="Введите количество шагов"
                                value={inputValue}
                                onChange={(e) => handleInputChange(e.target.value)}
                                onKeyDown={handleKeyPress}
                                error={validationError || undefined}
                                autoFocus
                                aria-label="Количество шагов"
                                aria-describedby={validationError ? "steps-error" : undefined}
                                aria-invalid={!!validationError}
                            />
                            {validationError && (
                                <div
                                    id="steps-error"
                                    className="sr-only"
                                    role="alert"
                                    aria-live="polite"
                                >
                                    {validationError}
                                </div>
                            )}
                        </div>

                        <div className="flex gap-2">
                            <Button
                                variant="primary"
                                size="sm"
                                onClick={handleSave}
                                isLoading={isSaving}
                                disabled={!!validationError || !inputValue.trim()}
                                className="flex-1"
                                aria-label="Сохранить количество шагов"
                            >
                                <Check className="h-4 w-4 mr-2" aria-hidden="true" />
                                Сохранить
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleCancel}
                                disabled={isSaving}
                                aria-label="Отменить ввод шагов"
                            >
                                Отмена
                            </Button>
                        </div>
                    </div>
                )}

                {/* Empty state or motivational message */}
                {currentSteps === 0 ? (
                    <div className="text-center py-2" role="status" aria-label="Шаги не записаны">
                        <p className="text-sm text-gray-500 mb-2">
                            Начните двигаться к цели
                        </p>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleQuickAdd}
                            className="text-blue-600 border-blue-200 hover:bg-blue-50"
                            aria-label="Добавить шаги"
                        >
                            <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
                            Добавить шаги
                        </Button>
                    </div>
                ) : !isGoalReached && (
                    <div className="text-center">
                        <p className="text-xs text-gray-500" aria-label={`Осталось ${(stepsGoal - currentSteps).toLocaleString()} шагов до цели`}>
                            Осталось {(stepsGoal - currentSteps).toLocaleString()} шагов до цели
                        </p>
                    </div>
                )}

                {/* Helper text */}
                <div className="text-xs text-gray-400 text-center">
                    Рекомендуется делать минимум 10,000 шагов в день
                </div>
            </CardContent>
        </Card>
    )
})
