/**
 * StepsBlock component for daily steps tracking
 *
 * Displays step goal and current count, progress bar indicator,
 * quick add functionality, completion indicator, and validation.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.6, 4.7
 */

import { useState, useCallback } from 'react'
import { Plus, Check, Target } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/Card'
import { Button } from '@/shared/components/ui/Button'
import { Input } from '@/shared/components/ui/Input'
import { cn } from '@/shared/utils/cn'
import { useDashboardStore } from '../store/dashboardStore'
import { validateSteps } from '../utils/validation'
import { calculatePercentage } from '../utils/calculations'
import toast from 'react-hot-toast'

/**
 * Props for StepsBlock component
 */
export interface StepsBlockProps {
    date: Date
    className?: string
}

/**
 * Props for progress bar component
 */
interface ProgressBarProps {
    percentage: number
    className?: string
}

/**
 * Progress bar component
 */
function ProgressBar({ percentage, className }: ProgressBarProps) {
    const cappedPercentage = Math.min(percentage, 100)
    const isComplete = percentage >= 100

    return (
        <div className={cn('w-full bg-gray-200 rounded-full h-3', className)}>
            <div
                className={cn(
                    'h-3 rounded-full transition-all duration-300',
                    isComplete ? 'bg-green-500' : 'bg-blue-500'
                )}
                style={{ width: `${cappedPercentage}%` }}
                role="progressbar"
                aria-valuenow={cappedPercentage}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Прогресс шагов: ${cappedPercentage.toFixed(1)}%`}
            />
        </div>
    )
}

/**
 * StepsBlock component
 */
export function StepsBlock({ date, className }: StepsBlockProps) {
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

    // Calculate percentage and completion
    const percentage = calculatePercentage(currentSteps, stepsGoal)
    const isGoalReached = currentSteps >= stepsGoal

    // Format steps display
    const formatSteps = (steps: number) => {
        if (steps >= 1000) {
            return `${(steps / 1000).toFixed(1)}k`
        }
        return steps.toString()
    }

    // Handle input change with validation
    const handleInputChange = useCallback((value: string) => {
        setInputValue(value)
        setValidationError(null)

        // Clear validation error when user starts typing
        if (value.trim() === '') {
            return
        }

        // Parse and validate input
        const numericValue = parseInt(value, 10)
        const validation = validateSteps(numericValue)

        if (!validation.isValid) {
            setValidationError(validation.error || 'Неверное значение')
        }
    }, [])

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

    return (
        <Card className={cn('h-full', className)} variant="bordered">
            <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-lg font-semibold text-gray-900">
                        Шаги
                    </CardTitle>
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

            <CardContent className="space-y-4">
                {/* Steps display */}
                <div className="text-center space-y-3">
                    <div className="space-y-1">
                        <div className="text-3xl font-bold text-gray-900">
                            {formatSteps(currentSteps)}
                        </div>
                        <div className="text-sm text-gray-500">
                            из {formatSteps(stepsGoal)} шагов
                        </div>
                        <div className={cn(
                            'text-sm font-medium',
                            isGoalReached ? 'text-green-600' : 'text-gray-600'
                        )}>
                            {percentage.toFixed(1)}%
                        </div>
                    </div>

                    {/* Progress bar */}
                    <ProgressBar percentage={percentage} />

                    {/* Completion indicator */}
                    {isGoalReached && (
                        <div className="flex items-center justify-center gap-2 text-green-600">
                            <Check className="h-4 w-4" />
                            <span className="text-sm font-medium">Цель достигнута!</span>
                        </div>
                    )}
                </div>

                {/* Input dialog */}
                {isDialogOpen && (
                    <div className="space-y-3 p-4 bg-gray-50 rounded-lg border">
                        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                            <Target className="h-4 w-4" />
                            <span>Обновить количество шагов</span>
                        </div>

                        <Input
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
                        />

                        <div className="flex gap-2">
                            <Button
                                variant="primary"
                                size="sm"
                                onClick={handleSave}
                                isLoading={isSaving}
                                disabled={!!validationError || !inputValue.trim()}
                                className="flex-1"
                            >
                                <Check className="h-4 w-4 mr-2" />
                                Сохранить
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleCancel}
                                disabled={isSaving}
                            >
                                Отмена
                            </Button>
                        </div>
                    </div>
                )}

                {/* Empty state or motivational message */}
                {currentSteps === 0 ? (
                    <div className="text-center py-4">
                        <div className="text-gray-400 mb-3">
                            <svg
                                className="h-12 w-12 mx-auto"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                aria-hidden="true"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={1.5}
                                    d="M13 10V3L4 14h7v7l9-11h-7z"
                                />
                            </svg>
                        </div>
                        <p className="text-sm text-gray-500 mb-3">
                            Начните двигаться к цели
                        </p>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleQuickAdd}
                            className="text-blue-600 border-blue-200 hover:bg-blue-50"
                        >
                            <Plus className="h-4 w-4 mr-2" />
                            Добавить шаги
                        </Button>
                    </div>
                ) : !isGoalReached && (
                    <div className="text-center">
                        <p className="text-xs text-gray-500">
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
}
