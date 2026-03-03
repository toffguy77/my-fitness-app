/**
 * WeightBlock component for daily weight tracking
 *
 * Displays input field for weight entry, shows previous weight for comparison,
 * quick add functionality, completion indicator, and validation.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7
 *
 * Performance optimizations:
 * - React.memo to prevent unnecessary re-renders
 * - Debounced input validation (300ms)
 */

import { useState, useCallback, memo, useMemo, useEffect } from 'react'
import { Plus, Check, TrendingUp, TrendingDown, Minus, Target } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/Card'
import { Button } from '@/shared/components/ui/Button'
import { Input } from '@/shared/components/ui/Input'
import { cn } from '@/shared/utils/cn'
import { useDashboardStore } from '../store/dashboardStore'
import { formatLocalDate } from '@/shared/utils/format'
import { validateWeight } from '../utils/validation'
import { useDebouncedCallback } from '@/shared/hooks/useDebounce'
import { AttentionBadge } from './AttentionBadge'
import { getProfile } from '@/features/settings/api/settings'
import toast from 'react-hot-toast'

/**
 * Props for WeightBlock component
 */
export interface WeightBlockProps {
    date: Date
    className?: string
}

/**
 * WeightBlock component
 * Wrapped with React.memo to prevent unnecessary re-renders
 */
export const WeightBlock = memo(function WeightBlock({ date, className }: WeightBlockProps) {
    const [inputValue, setInputValue] = useState('')
    const [isEditing, setIsEditing] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [validationError, setValidationError] = useState<string | null>(null)
    const [targetWeight, setTargetWeight] = useState<number | null>(null)

    // Get data from store
    const { dailyData, updateMetric } = useDashboardStore()
    const dateStr = formatLocalDate(date)
    const dayData = dailyData[dateStr]

    // Fetch target weight from profile settings
    useEffect(() => {
        getProfile()
            .then((profile) => {
                if (profile.settings?.target_weight != null) {
                    setTargetWeight(profile.settings.target_weight)
                }
            })
            .catch(() => {})
    }, [])

    // Get current and previous weight
    const currentWeight = dayData?.weight
    const isWeightLogged = currentWeight !== null && currentWeight !== undefined

    // Get previous day's weight for comparison - memoized
    const previousWeight = useMemo(() => {
        const previousDate = new Date(date)
        previousDate.setDate(date.getDate() - 1)
        const previousDateStr = formatLocalDate(previousDate)
        return dailyData[previousDateStr]?.weight
    }, [date, dailyData])

    // Calculate weight change
    const weightChange = currentWeight && previousWeight
        ? currentWeight - previousWeight
        : null

    // Calculate distance to target
    const distanceToTarget = currentWeight != null && targetWeight != null
        ? currentWeight - targetWeight
        : null

    // Format weight display
    const formatWeight = (weight: number) => {
        return weight % 1 === 0 ? weight.toString() : weight.toFixed(1)
    }

    // Debounced validation function (300ms delay)
    const debouncedValidate = useDebouncedCallback((value: string) => {
        if (value.trim() === '') {
            setValidationError(null)
            return
        }

        const numericValue = parseFloat(value)
        const validation = validateWeight(numericValue)

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

    // Handle save weight
    const handleSave = useCallback(async () => {
        if (!inputValue.trim()) {
            setValidationError('Введите вес')
            return
        }

        const numericValue = parseFloat(inputValue)
        const validation = validateWeight(numericValue)

        if (!validation.isValid) {
            setValidationError(validation.error || 'Неверное значение')
            return
        }

        setIsSaving(true)
        setValidationError(null)

        try {
            await updateMetric(dateStr, {
                type: 'weight',
                data: { weight: numericValue }
            })

            setInputValue('')
            setIsEditing(false)
            toast.success('Вес сохранен')
        } catch (error) {
            console.error('Failed to save weight:', error)
            setValidationError('Не удалось сохранить вес')
        } finally {
            setIsSaving(false)
        }
    }, [inputValue, dateStr, updateMetric])

    // Handle quick add button
    const handleQuickAdd = useCallback(() => {
        if (isWeightLogged) {
            // If weight is already logged, allow editing
            setInputValue(formatWeight(currentWeight))
            setIsEditing(true)
        } else {
            // If no weight logged, start editing
            setIsEditing(true)
        }
    }, [isWeightLogged, currentWeight])

    // Handle cancel editing
    const handleCancel = useCallback(() => {
        setInputValue('')
        setIsEditing(false)
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

    // Check if this is today and weight is not logged
    const isToday = dateStr === formatLocalDate(new Date())
    const showAttentionIndicator = isToday && !isWeightLogged

    return (
        <Card className={cn('h-full', className)} variant="bordered">
            <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <CardTitle className="text-lg font-semibold text-gray-900">
                            Вес
                        </CardTitle>
                        {showAttentionIndicator && (
                            <AttentionBadge
                                urgency="normal"
                                ariaLabel="Вес не записан сегодня"
                            />
                        )}
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleQuickAdd}
                        className="h-8 w-8 p-0"
                        aria-label={isWeightLogged ? "Изменить вес" : "Добавить вес"}
                    >
                        <Plus className="h-4 w-4" />
                    </Button>
                </div>
            </CardHeader>

            <CardContent className="space-y-4">
                {/* Current weight display or input */}
                {isEditing ? (
                    <div className="space-y-3">
                        <div>
                            <label htmlFor="weight-input" className="sr-only">
                                Вес в килограммах
                            </label>
                            <Input
                                id="weight-input"
                                type="number"
                                step="0.1"
                                min="0.1"
                                max="500"
                                placeholder="Введите вес в кг"
                                value={inputValue}
                                onChange={(e) => handleInputChange(e.target.value)}
                                onKeyDown={handleKeyPress}
                                error={validationError || undefined}
                                autoFocus
                                aria-label="Вес в килограммах"
                                aria-describedby={validationError ? "weight-error" : undefined}
                                aria-invalid={!!validationError}
                            />
                            {validationError && (
                                <div
                                    id="weight-error"
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
                                aria-label="Сохранить вес"
                            >
                                <Check className="h-4 w-4 mr-2" aria-hidden="true" />
                                Сохранить
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleCancel}
                                disabled={isSaving}
                                aria-label="Отменить ввод веса"
                            >
                                Отмена
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="text-center space-y-4">
                        {/* Current weight display */}
                        {isWeightLogged ? (
                            <div className="space-y-2" role="region" aria-label="Текущий вес">
                                <div className="text-4xl font-bold text-gray-900">
                                    <span aria-label={`Текущий вес ${formatWeight(currentWeight)} килограмм`}>
                                        {formatWeight(currentWeight)}
                                    </span>
                                    <span className="text-lg text-gray-500 ml-1" aria-hidden="true">кг</span>
                                </div>

                                {/* Completion indicator */}
                                <div
                                    className="flex items-center justify-center gap-2 text-green-600"
                                    role="status"
                                    aria-label="Вес записан"
                                >
                                    <Check className="h-4 w-4" aria-hidden="true" />
                                    <span className="text-sm font-medium">Вес записан</span>
                                </div>

                                {/* Weight change comparison */}
                                {weightChange !== null && (
                                    <div
                                        className={cn(
                                            'flex items-center justify-center gap-1 text-sm',
                                            weightChange > 0 ? 'text-red-600' :
                                                weightChange < 0 ? 'text-green-600' : 'text-gray-600'
                                        )}
                                        role="status"
                                        aria-label={`Изменение веса: ${weightChange > 0 ? 'увеличение' : weightChange < 0 ? 'уменьшение' : 'без изменений'} на ${Math.abs(weightChange).toFixed(1)} килограмм с вчера`}
                                    >
                                        {weightChange > 0 ? (
                                            <TrendingUp className="h-4 w-4" aria-hidden="true" />
                                        ) : weightChange < 0 ? (
                                            <TrendingDown className="h-4 w-4" aria-hidden="true" />
                                        ) : (
                                            <Minus className="h-4 w-4" aria-hidden="true" />
                                        )}
                                        <span>
                                            {weightChange > 0 ? '+' : ''}
                                            {formatWeight(Math.abs(weightChange))} кг
                                        </span>
                                        {weightChange !== 0 && (
                                            <span className="text-gray-500">
                                                с вчера
                                            </span>
                                        )}
                                    </div>
                                )}

                                {/* Previous weight reference */}
                                {previousWeight && (
                                    <div className="text-xs text-gray-500" aria-label={`Вчера вес был ${formatWeight(previousWeight)} килограмм`}>
                                        Вчера: {formatWeight(previousWeight)} кг
                                    </div>
                                )}

                                {/* Target weight with distance */}
                                {targetWeight != null && distanceToTarget != null && (
                                    <div className="flex items-center justify-center gap-1.5 text-xs text-gray-500 pt-1">
                                        <Target className="h-3.5 w-3.5 text-green-500" aria-hidden="true" />
                                        <span>Цель: {formatWeight(targetWeight)} кг</span>
                                        {Math.abs(distanceToTarget) >= 0.1 ? (
                                            <span className={distanceToTarget > 0 ? 'text-amber-600' : 'text-green-600'}>
                                                ({distanceToTarget > 0 ? '-' : '+'}{formatWeight(Math.abs(distanceToTarget))} кг)
                                            </span>
                                        ) : (
                                            <span className="text-green-600 font-medium">Достигнута!</span>
                                        )}
                                    </div>
                                )}
                            </div>
                        ) : (
                            /* Empty state */
                            <div className="py-8 space-y-3" role="status" aria-label="Вес не записан">
                                <div className="text-gray-400">
                                    <svg
                                        className="h-12 w-12 mx-auto mb-3"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                        aria-hidden="true"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={1.5}
                                            d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3"
                                        />
                                    </svg>
                                </div>
                                <p className="text-sm text-gray-500 mb-3">
                                    Вес не записан
                                </p>
                                {previousWeight && (
                                    <p className="text-xs text-gray-400 mb-3" aria-label={`Вчера вес был ${formatWeight(previousWeight)} килограмм`}>
                                        Вчера: {formatWeight(previousWeight)} кг
                                    </p>
                                )}
                                {/* Target weight in empty state */}
                                {targetWeight != null && (
                                    <div className="flex items-center justify-center gap-1.5 text-xs text-gray-500">
                                        <Target className="h-3.5 w-3.5 text-green-500" aria-hidden="true" />
                                        <span>Цель: {formatWeight(targetWeight)} кг</span>
                                    </div>
                                )}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleQuickAdd}
                                    className="text-blue-600 border-blue-200 hover:bg-blue-50"
                                    aria-label="Записать вес"
                                >
                                    <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
                                    Записать вес
                                </Button>
                            </div>
                        )}
                    </div>
                )}

                {/* Helper text */}
                {!isEditing && (
                    <div className="text-xs text-gray-400 text-center">
                        Рекомендуется взвешиваться утром натощак
                    </div>
                )}
            </CardContent>
        </Card>
    )
})
