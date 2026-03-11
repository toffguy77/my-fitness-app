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

import { useState, useEffect, useCallback, memo } from 'react'
import {
    UtensilsCrossed,
    Dumbbell,
    Star,
    Ruler,
    Check,
} from 'lucide-react'
import { dashboardApi } from '../api/dashboardApi'
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

function getExpectedCompletions(task: ClientTaskView): number {
    if (task.recurrence === 'daily') return 7
    if (task.recurrence === 'weekly') return task.recurrence_days?.length || 1
    return 1
}

/**
 * Mini calendar showing last 7 days with completion status
 */
function MiniCalendar({ completions }: { completions: string[] }) {
    const today = new Date()
    const completionSet = new Set(completions)
    const days: { date: string; label: string; filled: boolean }[] = []

    for (let i = 6; i >= 0; i--) {
        const d = new Date(today)
        d.setDate(d.getDate() - i)
        const dateStr = d.toISOString().slice(0, 10)
        days.push({
            date: dateStr,
            label: DAY_LABELS[d.getDay()],
            filled: completionSet.has(dateStr),
        })
    }

    return (
        <div className="flex items-center gap-1 mt-2">
            {days.map((day) => (
                <div key={day.date} className="flex flex-col items-center gap-0.5">
                    <span className="text-[9px] text-gray-400">{day.label}</span>
                    <div
                        className={`h-3 w-3 rounded-full ${
                            day.filled ? 'bg-green-500' : 'bg-gray-200'
                        }`}
                    />
                </div>
            ))}
        </div>
    )
}

export const ClientTasksSection = memo(function ClientTasksSection({
    className = '',
}: ClientTasksSectionProps) {
    const [tasks, setTasks] = useState<ClientTaskView[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        dashboardApi
            .getMyTasks()
            .then((data) => {
                setTasks(data.tasks || [])
            })
            .catch(() => {})
            .finally(() => setLoading(false))
    }, [])

    const handleComplete = useCallback(async (taskId: string) => {
        setTasks((prev) =>
            prev.map((t) =>
                t.id === taskId
                    ? {
                          ...t,
                          status: 'completed' as const,
                          completions: [
                              ...(t.completions || []),
                              new Date().toISOString().slice(0, 10),
                          ],
                      }
                    : t
            )
        )

        try {
            await dashboardApi.completeTask(taskId)
        } catch {
            setTasks((prev) =>
                prev.map((t) =>
                    t.id === taskId
                        ? {
                              ...t,
                              status: 'active' as const,
                              completions: (t.completions || []).slice(0, -1),
                          }
                        : t
                )
            )
        }
    }, [])

    if (loading) return null
    if (tasks.length === 0) return null

    return (
        <section
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
                    const isCompleted = task.status === 'completed'
                    const isOverdue = task.status === 'overdue'
                    const isRecurring = task.recurrence !== 'once'

                    return (
                        <div
                            key={task.id}
                            role="listitem"
                            className={`flex items-start gap-3 p-3 sm:p-4 rounded-xl border transition-colors ${
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
                                    <MiniCalendar completions={task.completions} />
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>
        </section>
    )
})
