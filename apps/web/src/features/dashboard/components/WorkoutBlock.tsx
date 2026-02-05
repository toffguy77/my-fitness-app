/**
 * WorkoutBlock component for daily workout tracking
 *
 * Displays workout completion status, quick add functionality,
 * workout type display, completion indicator, and prompts.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 */

import { useState, useCallback } from 'react'
import { Plus, Check, Dumbbell, Clock, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/Card'
import { Button } from '@/shared/components/ui/Button'
import { Input } from '@/shared/components/ui/Input'
import { cn } from '@/shared/utils/cn'
import { useDashboardStore } from '../store/dashboardStore'
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
const WORKOUT_TYPES = [
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
 */
export function WorkoutBlock({ date, className }: WorkoutBlockProps) {
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [selectedType, setSelectedType] = useState<string>('')
    const [customType, setCustomType] = useState('')
    const [duration, setDuration] = useState('')
    const [isSaving, setIsSaving] = useState(false)
    const [validationError, setValidationError] = useState<string | null>(null)

    // Get data from store
    const { dailyData, updateMetric } = useDashboardStore()
    const dateStr = date.toISOString().split('T')[0]
    const dayData = dailyData[dateStr]

    // Get current workout data
    const workout = dayData?.workout || { completed: false }
    const isWorkoutCompleted = workout.completed

    // Handle workout type selection
    const handleTypeSelect = useCallback((type: string) => {
        setSelectedType(type)
        setCustomType('')
        setValidationError(null)
    }, [])

    // Handle custom type input
    const handleCustomTypeChange = useCallback((value: string) => {
        setCustomType(value)
        if (value.trim()) {
            setSelectedType('Другое')
        }
        setValidationError(null)
    }, [])

    // Handle duration input
    const handleDurationChange = useCallback((value: string) => {
        setDuration(value)
        setValidationError(null)

        // Validate duration
        if (value.trim() && (isNaN(parseInt(value, 10)) || parseInt(value, 10) <= 0 || parseInt(value, 10) > 600)) {
            setValidationError('Длительность должна быть от 1 до 600 минут')
        }
    }, [])

    // Handle save workout
    const handleSave = useCallback(async () => {
        // Validate inputs
        if (!selectedType) {
            setValidationError('Выберите тип тренировки')
            return
        }

        if (selectedType === 'Другое' && !customType.trim()) {
            setValidationError('Укажите тип тренировки')
            return
        }

        if (duration.trim()) {
            const durationNum = parseInt(duration, 10)
            if (isNaN(durationNum) || durationNum <= 0 || durationNum > 600) {
                setValidationError('Длительность должна быть от 1 до 600 минут')
                return
            }
        }

        setIsSaving(true)
        setValidationError(null)

        try {
            const workoutType = selectedType === 'Другое' ? customType.trim() : selectedType
            const workoutDuration = duration.trim() ? parseInt(duration, 10) : undefined

            await updateMetric(dateStr, {
                type: 'workout',
                data: {
                    completed: true,
                    type: workoutType,
                    duration: workoutDuration,
                }
            })

            // Reset form
            setSelectedType('')
            setCustomType('')
            setDuration('')
            setIsDialogOpen(false)
            toast.success('Тренировка записана')
        } catch (error) {
            console.error('Failed to save workout:', error)
            setValidationError('Не удалось сохранить тренировку')
        } finally {
            setIsSaving(false)
        }
    }, [selectedType, customType, duration, dateStr, updateMetric])

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
            // If workout is completed, allow editing
            setSelectedType(workout.type || '')
            setDuration(workout.duration?.toString() || '')
        }
        setIsDialogOpen(true)
    }, [isWorkoutCompleted, workout])

    // Handle cancel dialog
    const handleCancel = useCallback(() => {
        setSelectedType('')
        setCustomType('')
        setDuration('')
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

    return (
        <Card className={cn('h-full', className)} variant="bordered">
            <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-lg font-semibold text-gray-900">
                        Тренировка
                    </CardTitle>
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
                    <div className="text-center space-y-4">
                        {/* Completion indicator */}
                        <div className="flex items-center justify-center gap-2 text-green-600">
                            <Check className="h-5 w-5" />
                            <span className="text-lg font-semibold">Тренировка выполнена</span>
                        </div>

                        {/* Workout details */}
                        <div className="space-y-2">
                            {workout.type && (
                                <div className="flex items-center justify-center gap-2 text-gray-700">
                                    <Dumbbell className="h-4 w-4" />
                                    <span className="font-medium">{workout.type}</span>
                                </div>
                            )}

                            {workout.duration && (
                                <div className="flex items-center justify-center gap-2 text-gray-600">
                                    <Clock className="h-4 w-4" />
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
                            >
                                Изменить
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleMarkNotCompleted}
                                isLoading={isSaving}
                                className="text-red-600 border-red-200 hover:bg-red-50"
                            >
                                <X className="h-4 w-4 mr-1" />
                                Отменить
                            </Button>
                        </div>
                    </div>
                ) : (
                    /* Empty state */
                    <div className="text-center py-6 space-y-4">
                        <div className="text-gray-400">
                            <Dumbbell className="h-12 w-12 mx-auto mb-3" />
                        </div>
                        <div className="space-y-2">
                            <p className="text-sm text-gray-500">
                                Тренировка не записана
                            </p>
                            <p className="text-xs text-gray-400">
                                Добавьте тренировку, чтобы отслеживать активность
                            </p>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleQuickAdd}
                            className="text-blue-600 border-blue-200 hover:bg-blue-50"
                        >
                            <Plus className="h-4 w-4 mr-2" />
                            Добавить тренировку
                        </Button>
                    </div>
                )}

                {/* Workout dialog */}
                {isDialogOpen && (
                    <div className="space-y-4 p-4 bg-gray-50 rounded-lg border">
                        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                            <Dumbbell className="h-4 w-4" />
                            <span>Добавить тренировку</span>
                        </div>

                        {/* Workout type selection */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700">
                                Тип тренировки
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                {WORKOUT_TYPES.map((type) => (
                                    <button
                                        key={type}
                                        type="button"
                                        onClick={() => handleTypeSelect(type)}
                                        className={cn(
                                            'px-3 py-2 text-sm rounded-lg border transition-colors',
                                            selectedType === type
                                                ? 'bg-blue-100 border-blue-300 text-blue-700'
                                                : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                                        )}
                                    >
                                        {type}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Custom type input */}
                        {selectedType === 'Другое' && (
                            <Input
                                placeholder="Укажите тип тренировки"
                                value={customType}
                                onChange={(e) => handleCustomTypeChange(e.target.value)}
                                aria-label="Тип тренировки"
                            />
                        )}

                        {/* Duration input */}
                        <Input
                            type="number"
                            min="1"
                            max="600"
                            placeholder="Длительность (минуты, необязательно)"
                            value={duration}
                            onChange={(e) => handleDurationChange(e.target.value)}
                            aria-label="Длительность тренировки в минутах"
                        />

                        {/* Error message */}
                        {validationError && (
                            <p className="text-sm text-red-600" role="alert">
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
                                disabled={!selectedType || (selectedType === 'Другое' && !customType.trim())}
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

                {/* Helper text */}
                {!isDialogOpen && (
                    <div className="text-xs text-gray-400 text-center">
                        Тренировки помогают достичь целей быстрее
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
