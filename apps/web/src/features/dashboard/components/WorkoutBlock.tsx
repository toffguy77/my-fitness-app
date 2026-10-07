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

import { useState, useCallback, useMemo, memo } from 'react'
import { Plus, Pencil, Check, Dumbbell, Clock, X } from 'lucide-react'
import { Card, CardTitle } from '@/shared/components/ui/Card'
import { Button, IconButton } from '@/shared/components/ui/Button'
import { Input } from '@/shared/components/ui/Input'
import { cn } from '@/shared/utils/cn'
import { useDashboardStore } from '../store/dashboardStore'
import type { WorkoutData } from '../types'
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

    // Get current workout data.
    //
    // Через useMemo, потому что от него зависит useCallback ниже: без него
    // «нет данных за день» — это новый объект на каждый рендер, и колбэк
    // пересоздавался бы всегда.
    const workout = useMemo<WorkoutData>(() => dayData?.workout || { completed: false }, [dayData?.workout])
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
        <Card className={cn('flex h-full flex-col gap-4', className)}>
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <CardTitle>{t('dashboard.workout.title')}</CardTitle>
                    {showAttentionIndicator && (
                        <AttentionBadge
                            urgency="normal"
                            ariaLabel={t('dashboard.workout.noneToday')}
                        />
                    )}
                </div>
                <IconButton
                    variant="ghost"
                    onClick={handleQuickAdd}
                    aria-label={isWorkoutCompleted ? t('dashboard.workout.change') : t('dashboard.workout.add')}
                >
                    {isWorkoutCompleted
                        ? <Pencil className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
                        : <Plus className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />}
                </IconButton>
            </div>

            {isWorkoutCompleted ? (
                <div className="space-y-3" role="region" aria-label={t('dashboard.workout.infoAria')}>
                    {/* Выполнено — состояние успеха */}
                    <div
                        className="flex items-center gap-1.5 text-success-fg"
                        role="status"
                        aria-label={t('dashboard.workout.doneAria')}
                    >
                        <Check className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
                        <span className="type-headline">{t('dashboard.workout.done')}</span>
                    </div>

                    <ul className="divide-y divide-line">
                        {(workout.types ?? (workout.type ? [workout.type] : [])).map(workoutType => (
                            <li key={workoutType} className="flex items-center gap-2 py-1.5 text-fg"
                                aria-label={t('dashboard.workout.typeAria', { type: workoutTypeLabel(workoutType) })}>
                                <Dumbbell className="h-4 w-4 text-fg-muted" strokeWidth={1.8} aria-hidden="true" />
                                <span className="font-medium">{workoutTypeLabel(workoutType)}</span>
                                {workout.typeDurations?.[workoutType] && (
                                    <span className="ml-auto flex items-center gap-1 text-sm text-fg-muted tabular-nums">
                                        <Clock className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                                        {formatDuration(workout.typeDurations[workoutType])}
                                    </span>
                                )}
                            </li>
                        ))}
                    </ul>
                    {/* Fallback: single duration for legacy records without per-type durations */}
                    {!workout.typeDurations && workout.duration && (
                        <div className="flex items-center gap-1 text-sm text-fg-muted tabular-nums" aria-label={t('dashboard.workout.durationAria', { duration: formatDuration(workout.duration) })}>
                            <Clock className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                            <span>{formatDuration(workout.duration)}</span>
                        </div>
                    )}

                    <div className="flex gap-2">
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={handleQuickAdd}
                            aria-label={t('dashboard.workout.change')}
                        >
                            {t('dashboard.workout.changeShort')}
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleMarkNotCompleted}
                            isLoading={isSaving}
                            className="text-danger-fg"
                            aria-label={t('dashboard.workout.cancelAria')}
                        >
                            <X className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                            {t('dashboard.workout.cancelShort')}
                        </Button>
                    </div>
                </div>
            ) : (
                <div className="flex items-center justify-between gap-2" role="status" aria-label={t('dashboard.workout.emptyAria')}>
                    <p className="text-sm text-fg-muted">{t('dashboard.workout.empty')}</p>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleQuickAdd}
                        aria-label={t('dashboard.workout.add')}
                    >
                        <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                        {t('common.add')}
                    </Button>
                </div>
            )}

            {/* Ввод тренировки */}
            {isDialogOpen && (
                <div className="space-y-4 rounded-tile border border-line bg-canvas p-3" role="dialog" aria-labelledby="workout-dialog-title">
                    <div id="workout-dialog-title" className="type-headline text-fg">
                        {t('dashboard.workout.add')}
                    </div>

                    {/* Выбор типов: выбранный чип — инверсия чернилами */}
                    <div className="space-y-2">
                        <label id="workout-type-label" className="text-sm font-medium text-fg-muted">
                            {t('dashboard.workout.typeLabel')}
                        </label>
                        <div className="flex flex-wrap gap-2" role="group" aria-labelledby="workout-type-label">
                            {WORKOUT_TYPES.map((type) => {
                                const isSelected = selectedTypes.includes(type)
                                return (
                                    <button
                                        key={type}
                                        type="button"
                                        role="checkbox"
                                        aria-checked={isSelected}
                                        onClick={() => handleTypeSelect(type)}
                                        className={cn(
                                            'inline-flex h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors duration-150 touch-manipulation',
                                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                                            isSelected
                                                ? 'border-fg bg-fg text-fg-inverse'
                                                : 'border-line bg-surface text-fg hover:bg-subtle'
                                        )}
                                        aria-label={t('dashboard.workout.typeAria', { type: workoutTypeLabel(type) })}
                                    >
                                        {workoutTypeLabel(type)}
                                    </button>
                                )
                            })}
                        </div>
                    </div>

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

                    {selectedTypes.length > 0 && (
                        <div className="space-y-2">
                            <span className="text-sm font-medium text-fg-muted">{t('dashboard.workout.durationLabel')}</span>
                            {selectedTypes.map(type => {
                                const displayName = type === OTHER_TYPE ? (customType || workoutTypeLabel(OTHER_TYPE)) : workoutTypeLabel(type)
                                return (
                                    <div key={type} className="flex items-center gap-2">
                                        <span className="min-w-[7rem] shrink-0 text-sm text-fg">{displayName}:</span>
                                        <Input
                                            type="number"
                                            inputMode="numeric"
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

                    {validationError && (
                        <p id="workout-error" className="text-sm text-danger-fg" role="alert" aria-live="polite">
                            {validationError}
                        </p>
                    )}

                    <div className="flex gap-2">
                        <Button
                            variant="secondary"
                            onClick={handleCancel}
                            disabled={isSaving}
                            aria-label={t('dashboard.workout.cancelAddAria')}
                        >
                            {t('common.cancel')}
                        </Button>
                        <Button
                            variant="primary"
                            onClick={handleSave}
                            isLoading={isSaving}
                            disabled={selectedTypes.length === 0 || (selectedTypes.includes(OTHER_TYPE) && !customType.trim())}
                            className="flex-1"
                            aria-label={t('dashboard.workout.saveAria')}
                        >
                            {t('common.save')}
                        </Button>
                    </div>
                </div>
            )}

            {!isDialogOpen && (
                <p className="mt-auto type-caption text-fg-subtle">
                    {t('dashboard.workout.hint')}
                </p>
            )}
        </Card>
    )
})
