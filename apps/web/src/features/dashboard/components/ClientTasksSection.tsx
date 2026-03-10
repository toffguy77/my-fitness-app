/**
 * ClientTasksSection Component
 *
 * Displays curator-assigned tasks with:
 * - Task type icons (nutrition, workout, habit, measurement)
 * - Deadline coloring (overdue=red, today=yellow, future=gray)
 * - Checkbox for completion with optimistic update
 * - Progress bar for recurring tasks
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

/**
 * Props for ClientTasksSection component
 */
export interface ClientTasksSectionProps {
    className?: string
}

/**
 * Get icon component for task type
 */
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

/**
 * Get label for task type
 */
function getTaskTypeLabel(type: ClientTaskType): string {
    switch (type) {
        case 'nutrition':
            return 'Питание'
        case 'workout':
            return 'Тренировка'
        case 'habit':
            return 'Привычка'
        case 'measurement':
            return 'Замер'
    }
}

/**
 * Determine deadline color class based on date
 */
function getDeadlineColor(deadline: string): string {
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    const deadlineDate = new Date(deadline)
    deadlineDate.setHours(0, 0, 0, 0)

    const diffMs = deadlineDate.getTime() - now.getTime()
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays < 0) return 'text-red-600'
    if (diffDays === 0) return 'text-yellow-600'
    return 'text-gray-500'
}

/**
 * Format deadline for display
 */
function formatDeadline(deadline: string): string {
    const date = new Date(deadline)
    return new Intl.DateTimeFormat('ru-RU', {
        day: 'numeric',
        month: 'short',
    }).format(date)
}

/**
 * Calculate expected completions for recurring tasks
 */
function getExpectedCompletions(task: ClientTaskView): number {
    if (task.recurrence === 'daily') return 7
    if (task.recurrence === 'weekly') return task.recurrence_days?.length || 1
    return 1
}

/**
 * ClientTasksSection Component
 */
export const ClientTasksSection = memo(function ClientTasksSection({
    className = '',
}: ClientTasksSectionProps) {
    const [tasks, setTasks] = useState<ClientTaskView[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        dashboardApi
            .getMyTasks()
            .then((data) => {
                // Handle both array responses and wrapped responses
                const taskList = Array.isArray(data) ? data : []
                setTasks(taskList)
            })
            .catch(() => {})
            .finally(() => setLoading(false))
    }, [])

    const handleComplete = useCallback(async (taskId: string) => {
        // Optimistic update
        setTasks((prev) =>
            prev.map((t) =>
                t.id === taskId
                    ? {
                          ...t,
                          status: 'completed' as const,
                          completions: [
                              ...(t.completions || []),
                              new Date().toISOString(),
                          ],
                      }
                    : t
            )
        )

        try {
            await dashboardApi.completeTask(taskId)
        } catch {
            // Revert optimistic update on failure
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

    // Don't render the section at all if loading or no tasks
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
                    const completionCount = task.completions?.length || 0
                    const expectedCount = getExpectedCompletions(task)

                    return (
                        <div
                            key={task.id}
                            role="listitem"
                            className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                                isOverdue
                                    ? 'border-l-4 border-l-red-500 border-red-200 bg-red-50'
                                    : isCompleted
                                      ? 'border-green-200 bg-green-50'
                                      : 'border-gray-200 bg-white hover:border-gray-300'
                            }`}
                            aria-label={`${getTaskTypeLabel(task.type)}: ${task.title}. ${
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
                            <Icon
                                className={`flex-shrink-0 w-4 h-4 mt-0.5 ${
                                    isCompleted
                                        ? 'text-green-600'
                                        : isOverdue
                                          ? 'text-red-500'
                                          : 'text-gray-400'
                                }`}
                                aria-hidden="true"
                            />

                            {/* Task content */}
                            <div className="flex-1 min-w-0">
                                <h4
                                    className={`text-sm font-medium ${
                                        isCompleted
                                            ? 'text-green-900 line-through'
                                            : 'text-gray-900'
                                    }`}
                                >
                                    {task.title}
                                </h4>
                                {task.description && (
                                    <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                                        {task.description}
                                    </p>
                                )}

                                <div className="flex items-center gap-3 mt-2">
                                    {/* Deadline */}
                                    <span
                                        className={`text-xs ${getDeadlineColor(task.deadline)}`}
                                    >
                                        До {formatDeadline(task.deadline)}
                                    </span>

                                    {/* Recurring task progress */}
                                    {isRecurring && (
                                        <div className="flex items-center gap-1.5">
                                            <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-blue-500 rounded-full transition-all"
                                                    style={{
                                                        width: `${Math.min(100, (completionCount / expectedCount) * 100)}%`,
                                                    }}
                                                />
                                            </div>
                                            <span className="text-xs text-gray-500">
                                                {completionCount}/{expectedCount}{' '}
                                                {task.recurrence === 'daily'
                                                    ? 'дней'
                                                    : 'раз'}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>
        </section>
    )
})
