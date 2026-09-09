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
import { t } from '@/shared/i18n'

import { workoutTypeLabel, workoutTypeCode } from '../utils/workoutTypeLabel'
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
// The workout types are stored with the workout and compared against in the
// state. They were Russian words until migration 062; codes now, so a second
// language can name them and the stored rows still match.
//
// OTHER_TYPE is named rather than written out at each comparison: it is the one
// entry with behaviour attached — it switches on the custom-name field — and
// spelling it eight times made that invisible. It is also the one that never
// reaches the database: what gets stored is what the person typed instead.
export const OTHER_TYPE = 'other'

export const WORKOUT_TYPES = [
    'strength',
    'cardio',
    'yoga',
    'hiit',
    'stretching',
    'swimming',
    'running',
    'cycling',
    OTHER_TYPE,
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
        if (type !== OTHER_TYPE) setCustomType('')
        setValidationError(null)
    }, [])

    // Handle custom type input
    const handleCustomTypeChange = useCallback((value: string) => {
        setCustomType(value)
        if (value.trim() && !selectedTypes.includes(OTHER_TYPE)) {
            setSelectedTypes(prev => [...prev, OTHER_TYPE])
            setDurations(prev => ({ ...prev, [OTHER_TYPE]: '' }))
        }
        setValidationError(null)
    }, [selectedTypes])

    // Handle per-type duration input
    const handleDurationChange = useCallback((type: string, value: string) => {
        setDurations(prev => ({ ...prev, [type]: value }))
        setValidationError(null)
        if (value.trim() && (isNaN(parseInt(value, 10)) || parseInt(value, 10) <= 0 || parseInt(value, 10) > 600)) {
            setValidationError(t('dashboard.workout.durationRange'))
        }
    }, [])

    // Handle save workout
    const handleSave = useCallback(async () => {
        if (selectedTypes.length === 0) {
            setValidationError(t('dashboard.workout.pickType'))
            return
        }

        if (selectedTypes.includes(OTHER_TYPE) && !customType.trim()) {
            setValidationError(t('dashboard.workout.nameType'))
            return
        }

        for (const val of Object.values(durations)) {
            if (val.trim()) {
                const n = parseInt(val, 10)
                if (isNaN(n) || n <= 0 || n > 600) {
                    setValidationError(t('dashboard.workout.durationRange'))
                    return
                }
            }
        }

        setIsSaving(true)
        setValidationError(null)

        try {
            const resolvedTypes = selectedTypes.map(type => type === OTHER_TYPE ? customType.trim() : type)
            const typeDurations: Record<string, number> = {}
            for (const [type, val] of Object.entries(durations)) {
                if (val.trim()) {
                    const resolved = type === OTHER_TYPE ? customType.trim() : type
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
            toast.success(t('dashboard.workout.saved'))
        } catch (error) {
            console.error('Failed to save workout:', error)
            setValidationError(t('dashboard.workout.saveFailed'))
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

            toast.success(t('dashboard.workout.cancelled'))
        } catch (error) {
            console.error('Failed to update workout:', error)
            toast.error(t('dashboard.workout.updateFailed'))
        } finally {
            setIsSaving(false)
        }
    }, [dateStr, updateMetric])

    // Handle quick add button
    const handleQuickAdd = useCallback(() => {
        if (isWorkoutCompleted) {
            // Through the code map: a day saved before migration 062 holds
            // Russian words, and comparing those against the code list would
            // leave every button unselected and then save the workout as if it
            // had been typed by hand.
            setSelectedTypes((workout.types ?? (workout.type ? [workout.type] : [])).map(workoutTypeCode))
            if (workout.typeDurations) {
                setDurations(Object.fromEntries(
                    Object.entries(workout.typeDurations).map(([k, v]) => [workoutTypeCode(k), String(v)])
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
            return t('dashboard.workout.minutes', { minutes })
        }
        const hours = Math.floor(minutes / 60)
        const remainingMinutes = minutes % 60
        return remainingMinutes > 0 ? t('dashboard.workout.hoursMinutes', { hours, minutes: remainingMinutes }) : t('dashboard.workout.hours', { hours })
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
                            {t('dashboard.workout.title')}
                        </CardTitle>
                        {showAttentionIndicator && (
                            <AttentionBadge
                                urgency="normal"
                                ariaLabel={t('dashboard.workout.noneToday')}
                            />
                        )}
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleQuickAdd}
                        className="h-8 w-8 p-0"
                        aria-label={isWorkoutCompleted ? t('dashboard.workout.change') : t('dashboard.workout.add')}
                    >
                        <Plus className="h-4 w-4" />
                    </Button>
                </div>
            </CardHeader>

            <CardContent className="space-y-4">
                {/* Workout status display */}
                {isWorkoutCompleted ? (
                    <div className="text-center space-y-4" role="region" aria-label={t('dashboard.workout.infoAria')}>
                        {/* Completion indicator */}
                        <div
                            className="flex items-center justify-center gap-2 text-green-600"
                            role="status"
                            aria-label={t('dashboard.workout.doneAria')}
                        >
                            <Check className="h-5 w-5" aria-hidden="true" />
                            <span className="text-lg font-semibold">{t('dashboard.workout.done')}</span>
                        </div>

                        {/* Workout details */}
                        <div className="space-y-1">
                            {(workout.types ?? (workout.type ? [workout.type] : [])).map(workoutType => (
                                <div key={workoutType} className="flex items-center justify-center gap-2 text-gray-700"
                                    aria-label={t('dashboard.workout.typeAria', { type: workoutTypeLabel(workoutType) })}>
                                    <Dumbbell className="h-4 w-4" aria-hidden="true" />
                                    <span className="font-medium">{workoutTypeLabel(workoutType)}</span>
                                    {workout.typeDurations?.[workoutType] && (
                                        <>
                                            <Clock className="h-4 w-4 text-gray-500" aria-hidden="true" />
                                            <span className="text-sm text-gray-500">{formatDuration(workout.typeDurations[workoutType])}</span>
                                        </>
                                    )}
                                </div>
                            ))}
                            {/* Fallback: single duration for legacy records without per-type durations */}
                            {!workout.typeDurations && workout.duration && (
                                <div className="flex items-center justify-center gap-2 text-gray-600" aria-label={t('dashboard.workout.durationAria', { duration: formatDuration(workout.duration) })}>
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
                                aria-label={t('dashboard.workout.change')}
                            >
                                {t('dashboard.workout.changeShort')}
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleMarkNotCompleted}
                                isLoading={isSaving}
                                className="text-red-600 border-red-200 hover:bg-red-50"
                                aria-label={t('dashboard.workout.cancelAria')}
                            >
                                <X className="h-4 w-4 mr-1" aria-hidden="true" />
                                {t('dashboard.workout.cancelShort')}
                            </Button>
                        </div>
                    </div>
                ) : (
                    /* Empty state */
                    <div className="text-center py-2 space-y-2" role="status" aria-label={t('dashboard.workout.emptyAria')}>
                        <Dumbbell className="h-8 w-8 mx-auto text-gray-300" aria-hidden="true" />
                        <p className="text-sm text-gray-500">{t('dashboard.workout.empty')}</p>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleQuickAdd}
                            className="text-blue-600 border-blue-200 hover:bg-blue-50"
                            aria-label={t('dashboard.workout.add')}
                        >
                            <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
                            {t('common.add')}
                        </Button>
                    </div>
                )}

                {/* Workout dialog */}
                {isDialogOpen && (
                    <div className="space-y-4 p-4 bg-gray-50 rounded-lg border" role="dialog" aria-labelledby="workout-dialog-title">
                        <div id="workout-dialog-title" className="flex items-center gap-2 text-sm font-medium text-gray-700">
                            <Dumbbell className="h-4 w-4" aria-hidden="true" />
                            <span>{t('dashboard.workout.add')}</span>
                        </div>

                        {/* Workout type selection (multi-select) */}
                        <div className="space-y-2">
                            <label id="workout-type-label" className="text-sm font-medium text-gray-700">
                                {t('dashboard.workout.typeLabel')}
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
                                        aria-label={t('dashboard.workout.typeAria', { type: workoutTypeLabel(type) })}
                                    >
                                        {workoutTypeLabel(type)}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Custom type input */}
                        {selectedTypes.includes(OTHER_TYPE) && (
                            <div>
                                <label htmlFor="custom-workout-type" className="sr-only">
                                    {t('dashboard.workout.nameType')}
                                </label>
                                <Input
                                    id="custom-workout-type"
                                    placeholder={t('dashboard.workout.customPlaceholder')}
                                    value={customType}
                                    onChange={(e) => handleCustomTypeChange(e.target.value)}
                                    aria-label={t('dashboard.workout.typeField')}
                                />
                            </div>
                        )}

                        {/* Per-type duration inputs */}
                        {selectedTypes.length > 0 && (
                            <div className="space-y-2">
                                <span className="text-sm font-medium text-gray-700">{t('dashboard.workout.durationLabel')}</span>
                                {selectedTypes.map(type => {
                                    const displayName = type === OTHER_TYPE ? (customType || workoutTypeLabel(OTHER_TYPE)) : workoutTypeLabel(type)
                                    return (
                                        <div key={type} className="flex items-center gap-2">
                                            <span className="text-sm text-gray-600 min-w-[7rem] shrink-0">{displayName}:</span>
                                            <Input
                                                type="number"
                                                min="1"
                                                max="600"
                                                placeholder={t('dashboard.workout.durationPlaceholder')}
                                                value={durations[type] ?? ''}
                                                onChange={(e) => handleDurationChange(type, e.target.value)}
                                                aria-label={t('dashboard.workout.durationAria', { duration: displayName })}
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
                                disabled={selectedTypes.length === 0 || (selectedTypes.includes(OTHER_TYPE) && !customType.trim())}
                                className="flex-1"
                                aria-label={t('dashboard.workout.saveAria')}
                            >
                                <Check className="h-4 w-4 mr-2" aria-hidden="true" />
                                {t('common.save')}
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleCancel}
                                disabled={isSaving}
                                aria-label={t('dashboard.workout.cancelAddAria')}
                            >
                                {t('common.cancel')}
                            </Button>
                        </div>
                    </div>
                )}

                {/* Helper text */}
                {!isDialogOpen && (
                    <div className="text-xs text-gray-400 text-center">
                        {t('dashboard.workout.hint')}
                    </div>
                )}
            </CardContent>
        </Card>
    )
})
