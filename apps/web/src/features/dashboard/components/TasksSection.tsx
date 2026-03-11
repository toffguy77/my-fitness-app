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
 *
 * Performance optimizations:
 * - React.memo to prevent unnecessary re-renders
 * - Virtual scrolling with react-window for large task lists
 * - Memoized TaskItem sub-component
 */

'use client'

import { useState, memo, useMemo, useCallback, useRef, useEffect, type CSSProperties } from 'react'
import { List } from 'react-window'
import { CheckCircle, Circle, ChevronRight, MoreHorizontal } from 'lucide-react'
import { useDashboardStore } from '../store/dashboardStore'
import type { Task } from '../types'
import { AttentionBadge } from './AttentionBadge'

/**
 * Props for TasksSection component
 */
export interface TasksSectionProps {
    className?: string
    maxVisibleTasks?: number
    currentWeek?: number // Optional for testing
    enableVirtualScrolling?: boolean // Enable virtual scrolling for large lists
    virtualScrollThreshold?: number // Number of tasks to trigger virtual scrolling
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
    const d = new Date(date)
    if (isNaN(d.getTime())) return '—'
    return new Intl.DateTimeFormat('ru-RU', {
        day: 'numeric',
        month: 'short',
    }).format(d)
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
 * Helper: Get tasks due within N days
 */
function getTasksDueWithinDays(tasks: Task[], days: number): Task[] {
    const now = new Date()
    // Reset time to start of day for date-only comparison
    now.setHours(0, 0, 0, 0)

    const futureDate = new Date(now)
    futureDate.setDate(now.getDate() + days)
    // Set to end of day
    futureDate.setHours(23, 59, 59, 999)

    return tasks.filter((task) => {
        if (task.status !== 'active') return false

        const dueDate = new Date(task.dueDate)
        if (isNaN(dueDate.getTime())) return false
        // Reset time for date-only comparison
        dueDate.setHours(0, 0, 0, 0)

        return dueDate >= now && dueDate <= futureDate
    })
}

/**
 * Helper: Check if date is today
 */
function isToday(date: Date): boolean {
    const today = new Date()
    return (
        date.getFullYear() === today.getFullYear() &&
        date.getMonth() === today.getMonth() &&
        date.getDate() === today.getDate()
    )
}

/**
 * TaskItem Component
 * Memoized to prevent unnecessary re-renders
 */
interface TaskItemProps {
    task: Task
    onToggleComplete: (taskId: string) => void
    onViewDetails: (taskId: string) => void
    style?: React.CSSProperties
}

const TaskItem = memo(function TaskItem({ task, onToggleComplete, onViewDetails, style }: TaskItemProps) {
    const isCompleted = task.status === 'completed'
    const isOverdue = task.status === 'overdue'
    const dueDateFormatted = formatDate(task.dueDate)

    return (
        <div
            style={style}
            className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${isCompleted
                ? 'bg-green-50 border-green-200'
                : isOverdue
                    ? 'bg-red-50 border-red-200'
                    : 'bg-white border-gray-200 hover:border-gray-300'
                }`}
            role="article"
            aria-label={`Задача: ${task.title}. ${isCompleted ? 'Выполнена' : isOverdue ? 'Просрочена' : 'Активна'}. Срок: ${dueDateFormatted}`}
        >
            {/* Completion checkbox */}
            <button
                type="button"
                onClick={() => onToggleComplete(task.id)}
                disabled={isCompleted}
                className="flex-shrink-0 mt-0.5 disabled:cursor-not-allowed"
                aria-label={isCompleted ? 'Задача выполнена' : 'Отметить задачу как выполненную'}
                aria-pressed={isCompleted}
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
                    <span>До {dueDateFormatted}</span>
                    {isOverdue && (
                        <span className="text-red-600 font-medium" role="status" aria-label="Задача просрочена">
                            Просрочено
                        </span>
                    )}
                </div>
            </div>

            {/* View details button */}
            <button
                type="button"
                onClick={() => onViewDetails(task.id)}
                className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600 transition-colors"
                aria-label={`Подробнее о задаче: ${task.title}`}
            >
                <ChevronRight className="w-5 h-5" aria-hidden="true" />
            </button>
        </div>
    )
})

/**
 * Virtual list row renderer
 */
interface VirtualRowProps {
    tasks: Task[]
    onToggleComplete: (taskId: string) => void
    onViewDetails: (taskId: string) => void
}

function VirtualRowComponent({
    index,
    style,
    tasks,
    onToggleComplete,
    onViewDetails
}: {
    ariaAttributes: { 'aria-posinset': number; 'aria-setsize': number; role: 'listitem' }
    index: number
    style: CSSProperties
} & VirtualRowProps) {
    const task = tasks[index]

    if (!task) return null

    return (
        <div style={{ ...style, paddingBottom: 8 }}>
            <TaskItem
                task={task}
                onToggleComplete={onToggleComplete}
                onViewDetails={onViewDetails}
            />
        </div>
    )
}

/**
 * TasksSection Component
 * Wrapped with React.memo to prevent unnecessary re-renders
 */
export const TasksSection = memo(function TasksSection({
    className = '',
    maxVisibleTasks = 5,
    currentWeek: currentWeekProp,
    enableVirtualScrolling = true,
    virtualScrollThreshold = 10,
}: TasksSectionProps) {
    const { tasks, updateTaskStatus } = useDashboardStore()
    const [showAll, setShowAll] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)
    const [containerHeight, setContainerHeight] = useState(400)

    const currentWeek = currentWeekProp ?? getCurrentWeekNumber()

    // Memoize grouped tasks
    const groupedTasks = useMemo(() => groupTasksByWeek(tasks), [tasks])

    // Get current and previous week tasks - memoized
    const { currentWeekTasks, previousWeekTasks, allTasks } = useMemo(() => {
        const current = groupedTasks.get(currentWeek) || []
        const previous = groupedTasks.get(currentWeek - 1) || []
        return {
            currentWeekTasks: current,
            previousWeekTasks: previous,
            allTasks: [...current, ...previous],
        }
    }, [groupedTasks, currentWeek])

    // Determine if virtual scrolling should be used
    const useVirtualScrolling = enableVirtualScrolling && allTasks.length > virtualScrollThreshold

    // Visible tasks for non-virtual mode
    const visibleTasks = useMemo(() => {
        return showAll ? allTasks : allTasks.slice(0, maxVisibleTasks)
    }, [showAll, allTasks, maxVisibleTasks])

    const hasMoreTasks = allTasks.length > maxVisibleTasks

    // Get urgent tasks (due within 2 days) - only for current day - memoized
    const { urgentTasks, showAttentionIndicator } = useMemo(() => {
        const today = new Date()
        const urgent = isToday(today) ? getTasksDueWithinDays(allTasks, 2) : []
        return {
            urgentTasks: urgent,
            showAttentionIndicator: urgent.length > 0,
        }
    }, [allTasks])

    // Update container height for virtual scrolling
    useEffect(() => {
        if (containerRef.current && useVirtualScrolling) {
            const updateHeight = () => {
                const maxHeight = Math.min(window.innerHeight * 0.5, 500)
                setContainerHeight(maxHeight)
            }
            updateHeight()
            window.addEventListener('resize', updateHeight)
            return () => window.removeEventListener('resize', updateHeight)
        }
    }, [useVirtualScrolling])

    /**
     * Handle task completion toggle
     */
    const handleToggleComplete = useCallback(async (taskId: string) => {
        try {
            await updateTaskStatus(taskId, 'completed')
        } catch (error) {
            // Error is handled by store (toast notification)
        }
    }, [updateTaskStatus])

    /**
     * Handle view task details
     */
    const handleViewDetails = useCallback((taskId: string) => {
        // TODO: Navigate to task details page or open modal
    }, [])

    // Virtual list row props
    const rowProps = useMemo<VirtualRowProps>(() => ({
        tasks: allTasks,
        onToggleComplete: handleToggleComplete,
        onViewDetails: handleViewDetails,
    }), [allTasks, handleToggleComplete, handleViewDetails])

    return (
        <section
            className={`tasks-section bg-white rounded-lg shadow-sm p-6 ${className}`}
            aria-labelledby="tasks-heading"
            aria-describedby={showAttentionIndicator ? "tasks-attention-indicator" : undefined}
        >
            <div className="flex items-center justify-between mb-4">
                <h2
                    id="tasks-heading"
                    className="text-lg font-semibold text-gray-900"
                >
                    Задачи
                </h2>
                {showAttentionIndicator && (
                    <AttentionBadge
                        urgency="high"
                        count={urgentTasks.length}
                        ariaLabel={`${urgentTasks.length} ${urgentTasks.length === 1 ? 'задача требует' : 'задач требуют'} внимания (срок в течение 2 дней)`}
                        announceChanges={true}
                        indicatesId="tasks-list"
                    />
                )}
            </div>

            {allTasks.length > 0 ? (
                <div ref={containerRef} className="space-y-4" role="list" aria-label="Список задач" id="tasks-list">
                    {useVirtualScrolling && showAll ? (
                        /* Virtual scrolling for large lists */
                        <List
                            defaultHeight={containerHeight}
                            rowCount={allTasks.length}
                            rowHeight={100}
                            rowComponent={VirtualRowComponent}
                            rowProps={rowProps}
                            className="scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100"
                        />
                    ) : (
                        /* Regular rendering for small lists */
                        <>
                            {/* Current week tasks */}
                            {currentWeekTasks.length > 0 && (
                                <div role="group" aria-labelledby={`week-${currentWeek}-heading`}>
                                    <h3 id={`week-${currentWeek}-heading`} className="text-sm font-medium text-gray-700 mb-2">
                                        Неделя {currentWeek}
                                    </h3>
                                    <div className="space-y-2">
                                        {currentWeekTasks
                                            .slice(0, showAll ? undefined : maxVisibleTasks)
                                            .map((task) => (
                                                <div key={task.id} role="listitem">
                                                    <TaskItem
                                                        task={task}
                                                        onToggleComplete={handleToggleComplete}
                                                        onViewDetails={handleViewDetails}
                                                    />
                                                </div>
                                            ))}
                                    </div>
                                </div>
                            )}

                            {/* Previous week tasks */}
                            {previousWeekTasks.length > 0 && (
                                <div role="group" aria-labelledby={`week-${currentWeek - 1}-heading`}>
                                    <h3 id={`week-${currentWeek - 1}-heading`} className="text-sm font-medium text-gray-700 mb-2">
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
                                                <div key={task.id} role="listitem">
                                                    <TaskItem
                                                        task={task}
                                                        onToggleComplete={handleToggleComplete}
                                                        onViewDetails={handleViewDetails}
                                                    />
                                                </div>
                                            ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {/* Show more button */}
                    {hasMoreTasks && !showAll && (
                        <button
                            type="button"
                            onClick={() => setShowAll(true)}
                            className="w-full flex items-center justify-center gap-2 py-2 text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded"
                            aria-label={`Показать еще ${allTasks.length - maxVisibleTasks} задач`}
                        >
                            <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
                            <span>Еще ({allTasks.length - maxVisibleTasks})</span>
                        </button>
                    )}

                    {/* Collapse button when showing all */}
                    {showAll && hasMoreTasks && (
                        <button
                            type="button"
                            onClick={() => setShowAll(false)}
                            className="w-full flex items-center justify-center gap-2 py-2 text-sm text-gray-600 hover:text-gray-700 font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 rounded"
                            aria-label="Свернуть список задач"
                        >
                            <span>Свернуть</span>
                        </button>
                    )}
                </div>
            ) : (
                /* Empty state */
                <div
                    className="flex flex-col items-center justify-center py-8 text-center"
                    role="status"
                    aria-label="Нет активных задач"
                >
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
})
