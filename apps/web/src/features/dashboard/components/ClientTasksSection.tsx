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
import { cn } from '@/shared/utils/cn'
import { formatLocalDate } from '@/shared/utils/format'
import type { ClientTaskView, ClientTaskType } from '../types'

const DAY_LABELS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']

const TYPE_LABELS: Record<ClientTaskType, string> = {
    nutrition: 'Питание',
    workout: 'Тренировка',
    habit: 'Привычка',
    measurement: 'Замеры',
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
    if (isNaN(deadlineDate.getTime())) return 'text-gray-500'
    deadlineDate.setHours(0, 0, 0, 0)

    const diffMs = deadlineDate.getTime() - now.getTime()
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays < 0) return 'text-red-600'
    if (diffDays === 0) return 'text-yellow-600'
    return 'text-gray-500'
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
                        <span className="text-[9px] text-gray-400">{day.label}</span>
                        <div
                            className={`h-3 w-3 rounded-full ${
                                day.filled
                                    ? 'bg-green-500'
                                    : scheduled
                                      ? 'border-2 border-green-400 bg-transparent'
                                      : 'bg-gray-200'
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

    // Scroll to section and flash task when highlightTaskId is set
    useEffect(() => {
        if (!highlightTaskId || loading || tasks.length === 0) return
        sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        setFlashId(highlightTaskId)
        const timer = setTimeout(() => setFlashId(null), 2000)
        return () => clearTimeout(timer)
    }, [highlightTaskId, loading, tasks.length])

    const handleComplete = useCallback((taskId: string) => {
        const task = tasks.find((t) => t.id === taskId)
        if (task?.type === 'workout') {
            // Open workout dialog instead of completing immediately
            setWorkoutTaskId(taskId)
            return
        }
        completeTaskOptimistic(taskId)
    }, [tasks])

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
        } catch {
            dashboardApi
                .getMyTasks()
                .then((data) => setTasks(data.tasks || []))
                .catch(() => {})
        }
    }, [])

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
            className={`bg-white rounded-lg shadow-sm p-4 sm:p-5 md:p-6 ${className}`}
            aria-labelledby="client-tasks-heading"
        >
            <h2
                id="client-tasks-heading"
                className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4"
            >
                Задачи от куратора
            </h2>

            <div className="space-y-2 sm:space-y-3" role="list" aria-label="Список задач от куратора">
                {tasks.map((task) => {
                    const Icon = getTaskTypeIcon(task.type)
                    const isCompleted = isCompletedToday(task)
                    const isOverdue = !isCompleted && task.status === 'overdue'
                    const isRecurring = task.recurrence !== 'once'

                    return (
                        <div
                            key={task.id}
                            role="listitem"
                            className={`flex items-start gap-3 p-3 sm:p-4 rounded-xl border transition-all ${
                                flashId === task.id
                                    ? 'ring-2 ring-blue-400 ring-offset-1'
                                    : ''
                            } ${
                                isOverdue
                                    ? 'border-l-4 border-l-red-500 border-red-200 bg-red-50'
                                    : isCompleted
                                      ? 'border-green-200 bg-green-50'
                                      : 'border-gray-100 bg-white shadow-sm'
                            }`}
                            aria-label={`${TYPE_LABELS[task.type]}: ${task.title}. ${
                                isCompleted
                                    ? 'Выполнена'
                                    : isOverdue
                                      ? 'Просрочена'
                                      : 'Активна'
                            }`}
                        >
                            {/* Completion checkbox */}
                            <button
                                type="button"
                                onClick={() => handleComplete(task.id)}
                                disabled={isCompleted}
                                className={`flex-shrink-0 mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                                    isCompleted
                                        ? 'bg-green-500 border-green-500 cursor-default'
                                        : 'border-gray-300 hover:border-green-400 cursor-pointer'
                                }`}
                                aria-label={
                                    isCompleted
                                        ? 'Задача выполнена'
                                        : 'Отметить как выполненную'
                                }
                            >
                                {isCompleted && (
                                    <Check
                                        className="w-3 h-3 text-white"
                                        aria-hidden="true"
                                    />
                                )}
                            </button>

                            {/* Task type icon */}
                            <div className={`flex-shrink-0 h-8 w-8 rounded-lg flex items-center justify-center ${
                                isCompleted
                                    ? 'bg-green-100'
                                    : isOverdue
                                      ? 'bg-red-100'
                                      : 'bg-gray-100'
                            }`}>
                                <Icon
                                    className={`w-4 h-4 ${
                                        isCompleted
                                            ? 'text-green-600'
                                            : isOverdue
                                              ? 'text-red-500'
                                              : 'text-gray-600'
                                    }`}
                                    aria-hidden="true"
                                />
                            </div>

                            {/* Task content */}
                            <div className="flex-1 min-w-0">
                                <h4
                                    className={`text-sm font-semibold ${
                                        isCompleted
                                            ? 'text-green-900 line-through'
                                            : 'text-gray-900'
                                    }`}
                                >
                                    {task.title}
                                </h4>

                                {/* Type label + deadline */}
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="text-xs text-gray-400">
                                        {TYPE_LABELS[task.type]}
                                    </span>
                                    <span className={`text-xs ${getDeadlineColor(task.deadline)}`}>
                                        до {formatDeadline(task.deadline)}
                                    </span>
                                </div>

                                {task.description && (
                                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">
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
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={handleWorkoutCancel}>
                    <div
                        className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 space-y-4"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 font-semibold text-gray-900">
                                <Dumbbell className="h-5 w-5" />
                                Тренировка
                            </div>
                            <button type="button" onClick={handleWorkoutCancel} className="text-gray-400 hover:text-gray-600">
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="space-y-2">
                            <span className="text-sm font-medium text-gray-700">Тип тренировки</span>
                            <div className="grid grid-cols-2 gap-2">
                                {WORKOUT_TYPES.map((type) => (
                                    <button
                                        key={type}
                                        type="button"
                                        onClick={() => setWorkoutType(type)}
                                        className={cn(
                                            'px-3 py-2 text-sm rounded-lg border transition-colors',
                                            workoutType === type
                                                ? 'bg-blue-100 border-blue-300 text-blue-700'
                                                : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                                        )}
                                    >
                                        {type}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-1">
                            <span className="text-sm font-medium text-gray-700 flex items-center gap-1">
                                <Clock className="h-3.5 w-3.5" />
                                Длительность (мин, необязательно)
                            </span>
                            <input
                                type="number"
                                min="1"
                                max="600"
                                placeholder="45"
                                value={workoutDuration}
                                onChange={(e) => setWorkoutDuration(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>

                        <div className="flex gap-2 pt-1">
                            <button
                                type="button"
                                onClick={handleWorkoutComplete}
                                disabled={!workoutType || workoutSaving}
                                className="flex-1 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                <Check className="h-4 w-4" />
                                Сохранить
                            </button>
                            <button
                                type="button"
                                onClick={handleWorkoutCancel}
                                disabled={workoutSaving}
                                className="px-4 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50"
                            >
                                Отмена
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </section>
    )
})
