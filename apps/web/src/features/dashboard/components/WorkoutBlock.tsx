/**
 * WorkoutBlock component for daily workout tracking
 *
 * Displays workout completion status, quick add functionality,
 * workout type display, completion indicator, and prompts.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 *
 * Performance optimizations:
 * - React.memo to prevent unnecessary re-renders
 * - Memoized workout type buttons
 */

import { useState, useCallback, memo, useMemo } from 'react'
import { Plus, Check, Dumbbell, Clock, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/Card'
import { Button } from '@/shared/components/ui/Button'
import { Input } from '@/shared/components/ui/Input'
import { cn } from '@/shared/utils/cn'
import { useDashboardStore } from '../store/dashboardStore'
import { formatLocalDate } from '@/shared/utils/format'
import { AttentionBadge } from './AttentionBadge'
import toast from 'react-hot-toast'

/**
 * Props for WorkoutBlock component
 */
export interface WorkoutBlockProps {
    date: Date
    className?: string
}

/**
 * Workout type options
 */
export const WORKOUT_TYPES = [
    'Силовая',
    'Кардио',
    'Йога',
    'HIIT',
    'Растяжка',
    'Плавание',
    'Бег',
    'Велосипед',
    'Другое',
] as const

/**
 * WorkoutBlock component
 * Wrapped with React.memo to prevent unnecessary re-renders
 */
export const WorkoutBlock = memo(function WorkoutBlock({ date, className }: WorkoutBlockProps) {
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [selectedTypes, setSelectedTypes] = useState<string[]>([])
    const [customType, setCustomType] = useState('')
    const [durations, setDurations] = useState<Record<string, string>>({})
    const [isSaving, setIsSaving] = useState(false)
    const [validationError, setValidationError] = useState<string | null>(null)

    // Get data from store
    const { dailyData, updateMetric } = useDashboardStore()
    const dateStr = formatLocalDate(date)
    const dayData = dailyData[dateStr]

    // Get current workout data
    const workout = dayData?.workout || { completed: false }
    const isWorkoutCompleted = workout.completed

    // Handle workout type toggle (multi-select)
    const handleTypeSelect = useCallback((type: string) => {
        setSelectedTypes(prev =>
            prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
        )
        setDurations(prev => {
            if (prev[type] !== undefined) {
                const next = { ...prev }
                delete next[type]
                return next
            }
            return { ...prev, [type]: '' }
        })
        if (type !== 'Другое') setCustomType('')
        setValidationError(null)
    }, [])

    // Handle custom type input
    const handleCustomTypeChange = useCallback((value: string) => {
        setCustomType(value)
        if (value.trim() && !selectedTypes.includes('Другое')) {
            setSelectedTypes(prev => [...prev, 'Другое'])
            setDurations(prev => ({ ...prev, 'Другое': '' }))
        }
        setValidationError(null)
    }, [selectedTypes])

    // Handle per-type duration input
    const handleDurationChange = useCallback((type: string, value: string) => {
        setDurations(prev => ({ ...prev, [type]: value }))
        setValidationError(null)
        if (value.trim() && (isNaN(parseInt(value, 10)) || parseInt(value, 10) <= 0 || parseInt(value, 10) > 600)) {
            setValidationError('Длительность должна быть от 1 до 600 минут')
        }
    }, [])

    // Handle save workout
    const handleSave = useCallback(async () => {
        if (selectedTypes.length === 0) {
            setValidationError('Выберите тип тренировки')
            return
        }

        if (selectedTypes.includes('Другое') && !customType.trim()) {
            setValidationError('Укажите тип тренировки')
            return
        }

        for (const val of Object.values(durations)) {
            if (val.trim()) {
                const n = parseInt(val, 10)
                if (isNaN(n) || n <= 0 || n > 600) {
                    setValidationError('Длительность должна быть от 1 до 600 минут')
                    return
                }
            }
        }

        setIsSaving(true)
        setValidationError(null)

        try {
            const resolvedTypes = selectedTypes.map(t => t === 'Другое' ? customType.trim() : t)
            const typeDurations: Record<string, number> = {}
            for (const [t, val] of Object.entries(durations)) {
                if (val.trim()) {
                    const resolved = t === 'Другое' ? customType.trim() : t
                    typeDurations[resolved] = parseInt(val, 10)
                }
            }

            await updateMetric(dateStr, {
                type: 'workout',
                data: {
                    completed: true,
                    types: resolvedTypes,
                    type: resolvedTypes[0], // backwards compat
                    typeDurations,
                }
            })

            // Reset form
            setSelectedTypes([])
            setCustomType('')
            setDurations({})
            setIsDialogOpen(false)
            toast.success('Тренировка записана')
        } catch (error) {
            console.error('Failed to save workout:', error)
            setValidationError('Не удалось сохранить тренировку')
        } finally {
            setIsSaving(false)
        }
    }, [selectedTypes, customType, durations, dateStr, updateMetric])

    // Handle mark as not completed
    const handleMarkNotCompleted = useCallback(async () => {
        setIsSaving(true)

        try {
            await updateMetric(dateStr, {
                type: 'workout',
                data: {
                    completed: false,
                }
            })

            toast.success('Тренировка отменена')
        } catch (error) {
            console.error('Failed to update workout:', error)
            toast.error('Не удалось обновить тренировку')
        } finally {
            setIsSaving(false)
        }
    }, [dateStr, updateMetric])

    // Handle quick add button
    const handleQuickAdd = useCallback(() => {
        if (isWorkoutCompleted) {
            setSelectedTypes(workout.types ?? (workout.type ? [workout.type] : []))
            if (workout.typeDurations) {
                setDurations(Object.fromEntries(
                    Object.entries(workout.typeDurations).map(([k, v]) => [k, String(v)])
                ))
            } else {
                setDurations({})
            }
        }
        setIsDialogOpen(true)
    }, [isWorkoutCompleted, workout])

    // Handle cancel dialog
    const handleCancel = useCallback(() => {
        setSelectedTypes([])
        setCustomType('')
        setDurations({})
        setIsDialogOpen(false)
        setValidationError(null)
    }, [])

    // Format duration display
    const formatDuration = (minutes: number) => {
        if (minutes < 60) {
            return `${minutes} мин`
        }
        const hours = Math.floor(minutes / 60)
        const remainingMinutes = minutes % 60
        return remainingMinutes > 0 ? `${hours}ч ${remainingMinutes}м` : `${hours}ч`
    }

    // Check if this is today and workout is not logged
    // Note: In a full implementation, we would check if today is a scheduled workout day
    // For now, we'll show the indicator on all days when workout is not logged
    const isToday = dateStr === formatLocalDate(new Date())
    const showAttentionIndicator = isToday && !isWorkoutCompleted

    return (
        <Card className={cn('h-full', className)} variant="bordered">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <CardTitle className="text-lg font-semibold text-gray-900">
                            Тренировка
                        </CardTitle>
                        {showAttentionIndicator && (
                            <AttentionBadge
                                urgency="normal"
                                ariaLabel="Тренировка не записана сегодня"
                            />
                        )}
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleQuickAdd}
                        className="h-8 w-8 p-0"
                        aria-label={isWorkoutCompleted ? "Изменить тренировку" : "Добавить тренировку"}
                    >
                        <Plus className="h-4 w-4" />
                    </Button>
                </div>
            </CardHeader>

            <CardContent className="space-y-4">
                {/* Workout status display */}
                {isWorkoutCompleted ? (
                    <div className="text-center space-y-4" role="region" aria-label="Информация о тренировке">
                        {/* Completion indicator */}
                        <div
                            className="flex items-center justify-center gap-2 text-green-600"
                            role="status"
                            aria-label="Тренировка выполнена"
                        >
                            <Check className="h-5 w-5" aria-hidden="true" />
                            <span className="text-lg font-semibold">Тренировка выполнена</span>
                        </div>

                        {/* Workout details */}
                        <div className="space-y-1">
                            {(workout.types ?? (workout.type ? [workout.type] : [])).map(t => (
                                <div key={t} className="flex items-center justify-center gap-2 text-gray-700"
                                    aria-label={`Тип тренировки: ${t}`}>
                                    <Dumbbell className="h-4 w-4" aria-hidden="true" />
                                    <span className="font-medium">{t}</span>
                                    {workout.typeDurations?.[t] && (
                                        <>
                                            <Clock className="h-4 w-4 text-gray-500" aria-hidden="true" />
                                            <span className="text-sm text-gray-500">{formatDuration(workout.typeDurations[t])}</span>
                                        </>
                                    )}
                                </div>
                            ))}
                            {/* Fallback: single duration for legacy records without per-type durations */}
                            {!workout.typeDurations && workout.duration && (
                                <div className="flex items-center justify-center gap-2 text-gray-600" aria-label={`Длительность: ${formatDuration(workout.duration)}`}>
                                    <Clock className="h-4 w-4" aria-hidden="true" />
                                    <span className="text-sm">{formatDuration(workout.duration)}</span>
                                </div>
                            )}
                        </div>

                        {/* Action buttons */}
                        <div className="flex gap-2 justify-center">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleQuickAdd}
                                className="text-blue-600 border-blue-200 hover:bg-blue-50"
                                aria-label="Изменить тренировку"
                            >
                                Изменить
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleMarkNotCompleted}
                                isLoading={isSaving}
                                className="text-red-600 border-red-200 hover:bg-red-50"
                                aria-label="Отменить тренировку"
                            >
                                <X className="h-4 w-4 mr-1" aria-hidden="true" />
                                Отменить
                            </Button>
                        </div>
                    </div>
                ) : (
                    /* Empty state */
                    <div className="text-center py-2 space-y-2" role="status" aria-label="Тренировка не записана">
                        <Dumbbell className="h-8 w-8 mx-auto text-gray-300" aria-hidden="true" />
                        <p className="text-sm text-gray-500">Не записано</p>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleQuickAdd}
                            className="text-blue-600 border-blue-200 hover:bg-blue-50"
                            aria-label="Добавить тренировку"
                        >
                            <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
                            Добавить
                        </Button>
                    </div>
                )}

                {/* Workout dialog */}
                {isDialogOpen && (
                    <div className="space-y-4 p-4 bg-gray-50 rounded-lg border" role="dialog" aria-labelledby="workout-dialog-title">
                        <div id="workout-dialog-title" className="flex items-center gap-2 text-sm font-medium text-gray-700">
                            <Dumbbell className="h-4 w-4" aria-hidden="true" />
                            <span>Добавить тренировку</span>
                        </div>

                        {/* Workout type selection (multi-select) */}
                        <div className="space-y-2">
                            <label id="workout-type-label" className="text-sm font-medium text-gray-700">
                                Тип тренировки (можно выбрать несколько)
                            </label>
                            <div className="grid grid-cols-2 gap-2" role="group" aria-labelledby="workout-type-label">
                                {WORKOUT_TYPES.map((type) => (
                                    <button
                                        key={type}
                                        type="button"
                                        role="checkbox"
                                        aria-checked={selectedTypes.includes(type)}
                                        onClick={() => handleTypeSelect(type)}
                                        className={cn(
                                            'px-3 py-2 text-sm rounded-lg border transition-colors',
                                            selectedTypes.includes(type)
                                                ? 'bg-blue-100 border-blue-300 text-blue-700'
                                                : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                                        )}
                                        aria-label={`Тип тренировки: ${type}`}
                                    >
                                        {type}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Custom type input */}
                        {selectedTypes.includes('Другое') && (
                            <div>
                                <label htmlFor="custom-workout-type" className="sr-only">
                                    Укажите тип тренировки
                                </label>
                                <Input
                                    id="custom-workout-type"
                                    placeholder="Укажите тип тренировки"
                                    value={customType}
                                    onChange={(e) => handleCustomTypeChange(e.target.value)}
                                    aria-label="Тип тренировки"
                                />
                            </div>
                        )}

                        {/* Per-type duration inputs */}
                        {selectedTypes.length > 0 && (
                            <div className="space-y-2">
                                <span className="text-sm font-medium text-gray-700">Длительность (мин, необязательно)</span>
                                {selectedTypes.map(type => {
                                    const displayName = type === 'Другое' ? (customType || 'Другое') : type
                                    return (
                                        <div key={type} className="flex items-center gap-2">
                                            <span className="text-sm text-gray-600 min-w-[7rem] shrink-0">{displayName}:</span>
                                            <Input
                                                type="number"
                                                min="1"
                                                max="600"
                                                placeholder="мин"
                                                value={durations[type] ?? ''}
                                                onChange={(e) => handleDurationChange(type, e.target.value)}
                                                aria-label={`Длительность: ${displayName}`}
                                                aria-invalid={!!validationError}
                                            />
                                        </div>
                                    )
                                })}
                            </div>
                        )}

                        {/* Error message */}
                        {validationError && (
                            <p id="workout-error" className="text-sm text-red-600" role="alert" aria-live="polite">
                                {validationError}
                            </p>
                        )}

                        {/* Action buttons */}
                        <div className="flex gap-2">
                            <Button
                                variant="primary"
                                size="sm"
                                onClick={handleSave}
                                isLoading={isSaving}
                                disabled={selectedTypes.length === 0 || (selectedTypes.includes('Другое') && !customType.trim())}
                                className="flex-1"
                                aria-label="Сохранить тренировку"
                            >
                                <Check className="h-4 w-4 mr-2" aria-hidden="true" />
                                Сохранить
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleCancel}
                                disabled={isSaving}
                                aria-label="Отменить добавление тренировки"
                            >
                                Отмена
                            </Button>
                        </div>
                    </div>
                )}

                {/* Helper text */}
                {!isDialogOpen && (
                    <div className="text-xs text-gray-400 text-center">
                        Тренировки помогают достичь целей быстрее
                    </div>
                )}
            </CardContent>
        </Card>
    )
})
