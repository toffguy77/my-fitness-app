'use client'

import { UtensilsCrossed, Dumbbell, Star, Ruler, Trash2 } from 'lucide-react'
import { cn } from '@/shared/utils/cn'
import type { TaskView, TaskType } from '../types'

const TYPE_ICONS: Record<TaskType, typeof UtensilsCrossed> = {
    nutrition: UtensilsCrossed,
    workout: Dumbbell,
    habit: Star,
    measurement: Ruler,
}

const TYPE_LABELS: Record<TaskType, string> = {
    nutrition: 'Питание',
    workout: 'Тренировка',
    habit: 'Привычка',
    measurement: 'Замеры',
}

const STATUS_LABELS: Record<string, string> = {
    active: 'Активная',
    completed: 'Завершена',
    overdue: 'Просрочена',
}

const STATUS_STYLES: Record<string, string> = {
    active: 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
    overdue: 'bg-red-100 text-red-800',
}

function getDeadlineColor(deadline: string): string {
    const d = new Date(deadline + 'T23:59:59')
    const now = new Date()
    if (d < now) return 'text-red-600'
    const weekFromNow = new Date()
    weekFromNow.setDate(weekFromNow.getDate() + 7)
    if (d <= weekFromNow) return 'text-yellow-600'
    return 'text-gray-500'
}

function formatDeadline(deadline: string): string {
    const d = new Date(deadline + 'T00:00:00')
    if (isNaN(d.getTime())) return deadline
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

/** Mini calendar for recurring tasks showing last 7 days with scheduled indicators */
function MiniCalendar({
    completions,
    recurrence,
    recurrenceDays,
}: {
    completions: string[]
    recurrence: string
    recurrenceDays?: number[]
}) {
    const days: { date: string; dayOfWeek: number; filled: boolean }[] = []
    const today = new Date()
    const completionSet = new Set(completions)
    const scheduledDaysSet = recurrenceDays ? new Set(recurrenceDays) : null

    for (let i = 6; i >= 0; i--) {
        const d = new Date(today)
        d.setDate(d.getDate() - i)
        const dateStr = d.toISOString().slice(0, 10)
        days.push({ date: dateStr, dayOfWeek: d.getDay(), filled: completionSet.has(dateStr) })
    }

    const dayLabels = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']

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
                        <span className="text-[9px] text-gray-400">{dayLabels[day.dayOfWeek]}</span>
                        <div
                            className={cn(
                                'h-3 w-3 rounded-full',
                                day.filled
                                    ? 'bg-green-500'
                                    : scheduled
                                      ? 'border-2 border-green-400 bg-transparent'
                                      : 'bg-gray-200',
                            )}
                        />
                    </div>
                )
            })}
        </div>
    )
}

interface TaskCardProps {
    task: TaskView
    onDelete?: (taskId: string) => void
}

export function TaskCard({ task, onDelete }: TaskCardProps) {
    const Icon = TYPE_ICONS[task.type] ?? Star

    return (
        <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
            <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100">
                    <Icon className="h-4 w-4 text-gray-600" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                        <h3 className="text-sm font-semibold text-gray-900 truncate">{task.title}</h3>
                        <div className="flex items-center gap-2 shrink-0">
                            <span
                                className={cn(
                                    'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                                    STATUS_STYLES[task.status] ?? 'bg-gray-100 text-gray-800',
                                )}
                            >
                                {STATUS_LABELS[task.status] ?? task.status}
                            </span>
                            {onDelete && (
                                <button
                                    type="button"
                                    onClick={() => onDelete(task.id)}
                                    className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                                    aria-label="Удалить задачу"
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-gray-400">{TYPE_LABELS[task.type]}</span>
                        <span className={cn('text-xs', getDeadlineColor(task.deadline))}>
                            до {formatDeadline(task.deadline)}
                        </span>
                    </div>
                    {task.description && (
                        <p className="mt-1 text-xs text-gray-500 line-clamp-2">{task.description}</p>
                    )}
                    {task.recurrence !== 'once' && task.completions && (
                        <MiniCalendar
                            completions={task.completions}
                            recurrence={task.recurrence}
                            recurrenceDays={task.recurrence_days}
                        />
                    )}
                </div>
            </div>
        </div>
    )
}
