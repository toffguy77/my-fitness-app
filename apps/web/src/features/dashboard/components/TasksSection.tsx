/**
 * TasksSection Component
 *
 * Displays coach-assigned tasks with:
 * - Current week tasks (active)
 * - Previous week tasks with status
 * - Week indicators (Неделя 1, Неделя 2)
 * - Click handler for task details
 * - Mark as complete action
 * - "Еще" link when > 5 tasks
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8
 */

'use client'

import { useState } from 'react'
import { CheckCircle, Circle, ChevronRight, MoreHorizontal } from 'lucide-react'
import { useDashboardStore } from '../store/dashboardStore'
import type { Task } from '../types'

/**
 * Props for TasksSection component
 */
export interface TasksSectionProps {
    className?: string
    maxVisibleTasks?: number
    currentWeek?: number // Optional for testing
}

/**
 * Helper: Get current week number
 */
function getCurrentWeekNumber(): number {
    const now = new Date()
    const start = new Date(now.getFullYear(), 0, 1)
    const diff = now.getTime() - start.getTime()
    const oneWeek = 1000 * 60 * 60 * 24 * 7
    return Math.ceil(diff / oneWeek)
}

/**
 * Helper: Format date for display
 */
function formatDate(date: Date): string {
    return new Intl.DateTimeFormat('ru-RU', {
        day: 'numeric',
        month: 'short',
    }).format(new Date(date))
}

/**
 * Helper: Group tasks by week
 */
function groupTasksByWeek(tasks: Task[]): Map<number, Task[]> {
    const grouped = new Map<number, Task[]>()

    tasks.forEach((task) => {
        const weekTasks = grouped.get(task.weekNumber) || []
        weekTasks.push(task)
        grouped.set(task.weekNumber, weekTasks)
    })

    return grouped
}

/**
 * TaskItem Component
 */
interface TaskItemProps {
    task: Task
    onToggleComplete: (taskId: string) => void
    onViewDetails: (taskId: string) => void
}

function TaskItem({ task, onToggleComplete, onViewDetails }: TaskItemProps) {
    const isCompleted = task.status === 'completed'
    const isOverdue = task.status === 'overdue'

    return (
        <div
            className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${isCompleted
                ? 'bg-green-50 border-green-200'
                : isOverdue
                    ? 'bg-red-50 border-red-200'
                    : 'bg-white border-gray-200 hover:border-gray-300'
                }`}
        >
            {/* Completion checkbox */}
            <button
                type="button"
                onClick={() => onToggleComplete(task.id)}
                disabled={isCompleted}
                className="flex-shrink-0 mt-0.5 disabled:cursor-not-allowed"
                aria-label={isCompleted ? 'Задача выполнена' : 'Отметить как выполненную'}
            >
                {isCompleted ? (
                    <CheckCircle className="w-5 h-5 text-green-600" aria-hidden="true" />
                ) : (
                    <Circle className="w-5 h-5 text-gray-400 hover:text-gray-600" aria-hidden="true" />
                )}
            </button>

            {/* Task content */}
            <div className="flex-1 min-w-0">
                <h4
                    className={`text-sm font-medium ${isCompleted ? 'text-green-900 line-through' : 'text-gray-900'
                        }`}
                >
                    {task.title}
                </h4>
                {task.description && (
                    <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                        {task.description}
                    </p>
                )}
                <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                    <span>До {formatDate(task.dueDate)}</span>
                    {isOverdue && (
                        <span className="text-red-600 font-medium">Просрочено</span>
                    )}
                </div>
            </div>

            {/* View details button */}
            <button
                type="button"
                onClick={() => onViewDetails(task.id)}
                className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="Подробнее о задаче"
            >
                <ChevronRight className="w-5 h-5" aria-hidden="true" />
            </button>
        </div>
    )
}

/**
 * TasksSection Component
 */
export function TasksSection({
    className = '',
    maxVisibleTasks = 5,
    currentWeek: currentWeekProp,
}: TasksSectionProps) {
    const { tasks, updateTaskStatus } = useDashboardStore()
    const [showAll, setShowAll] = useState(false)

    const currentWeek = currentWeekProp ?? getCurrentWeekNumber()
    const groupedTasks = groupTasksByWeek(tasks)

    // Get current and previous week tasks
    const currentWeekTasks = groupedTasks.get(currentWeek) || []
    const previousWeekTasks = groupedTasks.get(currentWeek - 1) || []

    // Combine and limit visible tasks
    const allTasks = [...currentWeekTasks, ...previousWeekTasks]
    const visibleTasks = showAll ? allTasks : allTasks.slice(0, maxVisibleTasks)
    const hasMoreTasks = allTasks.length > maxVisibleTasks

    /**
     * Handle task completion toggle
     */
    const handleToggleComplete = async (taskId: string) => {
        try {
            await updateTaskStatus(taskId, 'completed')
        } catch (error) {
            // Error is handled by store (toast notification)
        }
    }

    /**
     * Handle view task details
     */
    const handleViewDetails = (taskId: string) => {
        // TODO: Navigate to task details page or open modal
    }

    return (
        <section
            className={`tasks-section bg-white rounded-lg shadow-sm p-6 ${className}`}
            aria-labelledby="tasks-heading"
        >
            <h2
                id="tasks-heading"
                className="text-lg font-semibold text-gray-900 mb-4"
            >
                Задачи
            </h2>

            {allTasks.length > 0 ? (
                <div className="space-y-4">
                    {/* Current week tasks */}
                    {currentWeekTasks.length > 0 && (
                        <div>
                            <h3 className="text-sm font-medium text-gray-700 mb-2">
                                Неделя {currentWeek}
                            </h3>
                            <div className="space-y-2">
                                {currentWeekTasks
                                    .slice(0, showAll ? undefined : maxVisibleTasks)
                                    .map((task) => (
                                        <TaskItem
                                            key={task.id}
                                            task={task}
                                            onToggleComplete={handleToggleComplete}
                                            onViewDetails={handleViewDetails}
                                        />
                                    ))}
                            </div>
                        </div>
                    )}

                    {/* Previous week tasks */}
                    {previousWeekTasks.length > 0 && (
                        <div>
                            <h3 className="text-sm font-medium text-gray-700 mb-2">
                                Неделя {currentWeek - 1}
                            </h3>
                            <div className="space-y-2">
                                {previousWeekTasks
                                    .slice(
                                        0,
                                        showAll
                                            ? undefined
                                            : Math.max(0, maxVisibleTasks - currentWeekTasks.length)
                                    )
                                    .map((task) => (
                                        <TaskItem
                                            key={task.id}
                                            task={task}
                                            onToggleComplete={handleToggleComplete}
                                            onViewDetails={handleViewDetails}
                                        />
                                    ))}
                            </div>
                        </div>
                    )}

                    {/* Show more button */}
                    {hasMoreTasks && !showAll && (
                        <button
                            type="button"
                            onClick={() => setShowAll(true)}
                            className="w-full flex items-center justify-center gap-2 py-2 text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors"
                        >
                            <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
                            <span>Еще ({allTasks.length - maxVisibleTasks})</span>
                        </button>
                    )}
                </div>
            ) : (
                /* Empty state */
                <div className="flex flex-col items-center justify-center py-8 text-center">
                    <div className="w-16 h-16 mb-4 rounded-full bg-gray-100 flex items-center justify-center">
                        <CheckCircle className="w-8 h-8 text-gray-400" aria-hidden="true" />
                    </div>
                    <p className="text-gray-600 text-sm">Нет активных задач</p>
                    <p className="text-gray-500 text-xs mt-2">
                        Твой тренер назначит задачи
                    </p>
                </div>
            )}
        </section>
    )
}
