/**
 * ClientTasksSection Component
 *
 * Displays curator-assigned tasks with:
 * - Task type icon + label (nutrition, workout, habit, measurement)
 * - Deadline with color coding (overdue=red, today=yellow, future=gray)
 * - Checkbox for completion with optimistic update
 * - Mini calendar for recurring tasks (last 7 days)
 * - Overdue tasks highlighted with red left border
 *
 * Renders nothing when there are no tasks.
 */

'use client'

import { useState, useEffect, useCallback, useRef, memo } from 'react'
import {
    UtensilsCrossed,
    Dumbbell,
    Star,
    Ruler,
    Check,
    X,
    Clock,
} from 'lucide-react'
import { dashboardApi } from '../api/dashboardApi'
import { useDashboardStore } from '../store/dashboardStore'
import { WORKOUT_TYPES } from './WorkoutBlock'
import { workoutTypeLabel } from '../utils/workoutTypeLabel'
import { cn } from '@/shared/utils/cn'
import { Button, IconButton } from '@/shared/components/ui/Button'
import { formatLocalDate } from '@/shared/utils/format'
import type { ClientTaskView, ClientTaskType } from '../types'
import { t } from '@/shared/i18n'
import toast from 'react-hot-toast'
import { messageForOr } from '@/shared/errors/apiErrors'

const DAY_LABELS = [
    t('weekdays.short.sun'),
    t('weekdays.short.mon'),
    t('weekdays.short.tue'),
    t('weekdays.short.wed'),
    t('weekdays.short.thu'),
    t('weekdays.short.fri'),
    t('weekdays.short.sat'),
]

const TYPE_LABELS: Record<ClientTaskType, string> = {
    nutrition: t('dashboard.tasks.typeNutrition'),
    workout: t('dashboard.tasks.typeWorkout'),
    habit: t('dashboard.tasks.typeHabit'),
    measurement: t('dashboard.tasks.typeMeasurement'),
}

export interface ClientTasksSectionProps {
    className?: string
    highlightTaskId?: string | null
}

function getTaskTypeIcon(type: ClientTaskType) {
    switch (type) {
        case 'nutrition':
            return UtensilsCrossed
        case 'workout':
            return Dumbbell
        case 'habit':
            return Star
        case 'measurement':
            return Ruler
    }
}

function getDeadlineColor(deadline: string): string {
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    const deadlineDate = new Date(deadline)
    if (isNaN(deadlineDate.getTime())) return 'text-fg-muted'
    deadlineDate.setHours(0, 0, 0, 0)

    const diffMs = deadlineDate.getTime() - now.getTime()
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays < 0) return 'text-danger-fg'
    if (diffDays === 0) return 'text-warning-fg'
    return 'text-fg-muted'
}

function formatDeadline(deadline: string): string {
    const date = new Date(deadline)
    if (isNaN(date.getTime())) return '—'
    return new Intl.DateTimeFormat('ru-RU', {
        day: 'numeric',
        month: 'short',
    }).format(date)
}

function isCompletedToday(task: ClientTaskView): boolean {
    const today = new Date().toISOString().slice(0, 10)
    return (
        task.status === 'completed' ||
        (task.completions || []).includes(today)
    )
}

/**
 * Mini calendar showing last 7 days with completion + scheduled status
 * - Green filled = completed
 * - Green ring = scheduled but not completed
 * - Gray dot = not scheduled
 */
function MiniCalendar({
    completions,
    recurrence,
    recurrenceDays,
}: {
    completions: string[]
    recurrence: string
    recurrenceDays?: number[]
}) {
    const today = new Date()
    const completionSet = new Set(completions)
    const scheduledDaysSet = recurrenceDays ? new Set(recurrenceDays) : null
    const days: { date: string; label: string; dayOfWeek: number; filled: boolean }[] = []

    for (let i = 6; i >= 0; i--) {
        const d = new Date(today)
        d.setDate(d.getDate() - i)
        const dateStr = d.toISOString().slice(0, 10)
        days.push({
            date: dateStr,
            label: DAY_LABELS[d.getDay()],
            dayOfWeek: d.getDay(),
            filled: completionSet.has(dateStr),
        })
    }

    function isScheduled(dayOfWeek: number): boolean {
        if (recurrence === 'daily') return true
        if (recurrence === 'weekly' && scheduledDaysSet) return scheduledDaysSet.has(dayOfWeek)
        return false
    }

    return (
        <div className="flex items-center gap-1 mt-2">
            {days.map((day) => {
                const scheduled = isScheduled(day.dayOfWeek)
                return (
                    <div key={day.date} className="flex flex-col items-center gap-0.5">
                        <span className="text-[10px] leading-3 text-fg-subtle">{day.label}</span>
                        <div
                            className={`h-3 w-3 rounded-full ${
                                day.filled
                                    ? 'bg-success'
                                    : scheduled
                                      ? 'border-2 border-success bg-transparent'
                                      : 'bg-track'
                            }`}
                        />
                    </div>
                )
            })}
        </div>
    )
}

export const ClientTasksSection = memo(function ClientTasksSection({
    className = '',
    highlightTaskId,
}: ClientTasksSectionProps) {
    const [tasks, setTasks] = useState<ClientTaskView[]>([])
    const [loading, setLoading] = useState(true)
    const sectionRef = useRef<HTMLElement>(null)
    const [flashId, setFlashId] = useState<string | null>(null)

    // Workout dialog state (Direction 1: task → feature)
    const [workoutTaskId, setWorkoutTaskId] = useState<string | null>(null)
    const [workoutType, setWorkoutType] = useState('')
    const [workoutDuration, setWorkoutDuration] = useState('')
    const [workoutSaving, setWorkoutSaving] = useState(false)

    const tasksVersion = useDashboardStore((s) => s.tasksVersion)

    useEffect(() => {
        dashboardApi
            .getMyTasks()
            .then((data) => {
                setTasks(data.tasks || [])
            })
            .catch(() => {})
            .finally(() => setLoading(false))
    }, [tasksVersion])

    // Scroll to section and flash task when highlightTaskId is set.
    //
    // The flash starts on a timer rather than in the effect body: it is a
    // consequence of having rendered, not a correction to the render.
    useEffect(() => {
        if (!highlightTaskId || loading || tasks.length === 0) return

        sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })

        const start = setTimeout(() => setFlashId(highlightTaskId), 0)
        const stop = setTimeout(() => setFlashId(null), 2000)
        return () => {
            clearTimeout(start)
            clearTimeout(stop)
        }
    }, [highlightTaskId, loading, tasks.length])

    const completeTaskOptimistic = useCallback(async (
        taskId: string,
        workoutData?: { workout_type: string; workout_duration?: number },
    ) => {
        const today = new Date().toISOString().slice(0, 10)

        setTasks((prev) =>
            prev.map((t) => {
                if (t.id !== taskId) return t
                const alreadyHasToday = (t.completions || []).includes(today)
                return {
                    ...t,
                    status: t.recurrence === 'once' ? ('completed' as const) : t.status,
                    completions: alreadyHasToday
                        ? t.completions
                        : [...(t.completions || []), today],
                }
            })
        )

        try {
            const result = await dashboardApi.completeTask(taskId, workoutData)
            // If workout metric was synced, refresh daily data so WorkoutBlock updates
            if (result?.metric_synced) {
                const todayDate = formatLocalDate(new Date())
                useDashboardStore.getState().refreshDailyData(new Date(todayDate))
            }
        } catch (err) {
            // Галочка уже стояла и сейчас отскочит обратно. Без причины это
            // читается как «не нажалось», и человек жмёт ещё раз.
            toast.error(messageForOr(err, t('dashboard.tasks.completeFailed')))
            dashboardApi
                .getMyTasks()
                .then((data) => setTasks(data.tasks || []))
                .catch(() => {
                    // Молчим намеренно: это попытка вернуть достоверный
                    // список после уже показанного отказа. Второй тост про
                    // то же самое действие ничего не добавит.
                })
        }
    }, [])

    const handleComplete = useCallback((taskId: string) => {
        const task = tasks.find((t) => t.id === taskId)
        if (task?.type === 'workout') {
            // Open workout dialog instead of completing immediately
            setWorkoutTaskId(taskId)
            return
        }
        completeTaskOptimistic(taskId)
    }, [tasks, completeTaskOptimistic])

    const handleWorkoutComplete = useCallback(async () => {
        if (!workoutTaskId || !workoutType) return
        setWorkoutSaving(true)
        try {
            const durationNum = workoutDuration.trim() ? parseInt(workoutDuration, 10) : undefined
            await completeTaskOptimistic(workoutTaskId, {
                workout_type: workoutType,
                workout_duration: durationNum,
            })
            setWorkoutTaskId(null)
            setWorkoutType('')
            setWorkoutDuration('')
        } finally {
            setWorkoutSaving(false)
        }
    }, [workoutTaskId, workoutType, workoutDuration, completeTaskOptimistic])

    const handleWorkoutCancel = useCallback(() => {
        setWorkoutTaskId(null)
        setWorkoutType('')
        setWorkoutDuration('')
    }, [])

    if (loading) return null
    if (tasks.length === 0) return null

    return (
        <section
            ref={sectionRef}
            className={`rounded-card border border-line bg-surface p-5 ${className}`}
            aria-labelledby="client-tasks-heading"
        >
            <h2
                id="client-tasks-heading"
                className="mb-2 type-title-2 text-fg"
            >
                {t('dashboard.tasks.fromCurator')}
            </h2>

            <div className="divide-y divide-line" role="list" aria-label={t('dashboard.tasks.fromCuratorAria')}>
                {tasks.map((task) => {
                    const Icon = getTaskTypeIcon(task.type)
                    const isCompleted = isCompletedToday(task)
                    const isOverdue = !isCompleted && task.status === 'overdue'
                    const isRecurring = task.recurrence !== 'once'

                    return (
                        <div
                            key={task.id}
                            role="listitem"
                            // Строка списка ≥ 56 px; состояние — знаком и словом.
                            className={cn(
                                'flex min-h-14 items-start gap-2 rounded-tile py-2 transition-shadow',
                                flashId === task.id && 'ring-2 ring-focus ring-offset-2',
                            )}
                            aria-label={t('dashboard.tasks.clientTaskAria', {
                                type: TYPE_LABELS[task.type],
                                title: task.title,
                                status: isCompleted
                                    ? t('dashboard.tasks.statusDone')
                                    : isOverdue
                                      ? t('dashboard.tasks.statusOverdue')
                                      : t('dashboard.tasks.statusActive'),
                            })}
                        >
                            {/* Completion checkbox — цель нажатия 44 px */}
                            <button
                                type="button"
                                onClick={() => handleComplete(task.id)}
                                disabled={isCompleted}
                                className="-ml-2.5 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full transition-colors hover:bg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-default disabled:hover:bg-transparent"
                                aria-label={
                                    isCompleted
                                        ? t('dashboard.tasks.doneAria')
                                        : t('dashboard.tasks.markDoneAria')
                                }
                            >
                                <span
                                    className={cn(
                                        'flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 transition-colors',
                                        isCompleted ? 'border-success bg-success' : 'border-line-strong',
                                    )}
                                    aria-hidden="true"
                                >
                                    {isCompleted && (
                                        <Check className="h-3.5 w-3.5 text-on-primary" strokeWidth={3} aria-hidden="true" />
                                    )}
                                </span>
                            </button>

                            {/* Task type icon — опознаёт тип, без оценки */}
                            <div className="mt-1.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-tile bg-subtle">
                                <Icon className="h-4 w-4 text-fg-muted" strokeWidth={1.8} aria-hidden="true" />
                            </div>

                            {/* Task content */}
                            <div className="min-w-0 flex-1 pt-2">
                                <h4
                                    className={cn(
                                        'type-headline',
                                        isCompleted ? 'text-fg-muted line-through' : 'text-fg',
                                    )}
                                >
                                    {task.title}
                                </h4>

                                {/* Type label + deadline */}
                                <div className="mt-0.5 flex flex-wrap items-center gap-2 type-caption tabular-nums">
                                    <span className="text-fg-muted">
                                        {TYPE_LABELS[task.type]}
                                    </span>
                                    <span className={getDeadlineColor(task.deadline)}>
                                        {t('dashboard.tasks.deadline', { date: formatDeadline(task.deadline) })}
                                    </span>
                                    {isOverdue && (
                                        <span className="rounded-full bg-danger-soft px-2 font-medium text-danger-fg">
                                            {t('dashboard.tasks.overdue')}
                                        </span>
                                    )}
                                </div>

                                {task.description && (
                                    <p className="mt-1 line-clamp-2 text-sm text-fg-muted">
                                        {task.description}
                                    </p>
                                )}

                                {/* Mini calendar for recurring tasks */}
                                {isRecurring && task.completions && (
                                    <MiniCalendar
                                        completions={task.completions}
                                        recurrence={task.recurrence}
                                        recurrenceDays={task.recurrence_days}
                                    />
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* Workout dialog for Direction 1: task completion → feature sync */}
            {workoutTaskId !== null && (
                <div className="fixed inset-0 z-50 flex items-end justify-center bg-scrim sm:items-center" onClick={handleWorkoutCancel}>
                    <div
                        className="w-full space-y-4 rounded-t-sheet bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-overlay sm:max-w-md sm:rounded-sheet"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="client-task-workout-title"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between gap-2">
                            <h3 id="client-task-workout-title" className="flex items-center gap-2 type-title-2 text-fg">
                                <Dumbbell className="h-5 w-5 text-fg-muted" strokeWidth={1.8} aria-hidden="true" />
                                {t('dashboard.tasks.typeWorkout')}
                            </h3>
                            <IconButton variant="ghost" onClick={handleWorkoutCancel} aria-label={t('common.close')}>
                                <X className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
                            </IconButton>
                        </div>

                        <div className="space-y-2">
                            <span className="text-sm font-medium text-fg-muted">{t('dashboard.tasks.workoutType')}</span>
                            {/* Выбранный тип — инверсия чернилами */}
                            <div className="flex flex-wrap gap-2">
                                {WORKOUT_TYPES.map((type) => (
                                    <button
                                        key={type}
                                        type="button"
                                        onClick={() => setWorkoutType(type)}
                                        aria-pressed={workoutType === type}
                                        className={cn(
                                            'inline-flex h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors duration-150 touch-manipulation',
                                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                                            workoutType === type
                                                ? 'border-fg bg-fg text-fg-inverse'
                                                : 'border-line bg-surface text-fg hover:bg-subtle'
                                        )}
                                    >
                                        {workoutTypeLabel(type)}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label htmlFor="client-task-workout-duration" className="flex items-center gap-1 text-sm font-medium text-fg-muted">
                                <Clock className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
                                {t('dashboard.tasks.durationLabel')}
                            </label>
                            <input
                                id="client-task-workout-duration"
                                type="number"
                                inputMode="numeric"
                                min="1"
                                max="600"
                                placeholder="45"
                                value={workoutDuration}
                                onChange={(e) => setWorkoutDuration(e.target.value)}
                                className="h-12 w-full rounded-field border border-line bg-surface px-4 text-base text-fg tabular-nums placeholder:text-fg-subtle focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-focus/30"
                            />
                        </div>

                        {/* Отказ первым */}
                        <div className="flex gap-2 pt-1">
                            <Button
                                variant="secondary"
                                size="lg"
                                onClick={handleWorkoutCancel}
                                disabled={workoutSaving}
                            >
                                {t('common.cancel')}
                            </Button>
                            <Button
                                variant="primary"
                                size="lg"
                                onClick={handleWorkoutComplete}
                                disabled={!workoutType || workoutSaving}
                                isLoading={workoutSaving}
                                className="flex-1"
                            >
                                {t('common.save')}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </section>
    )
})
