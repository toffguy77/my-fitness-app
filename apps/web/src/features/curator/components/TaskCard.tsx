'use client'

import { UtensilsCrossed, Dumbbell, Star, Ruler, Pencil, Trash2 } from 'lucide-react'
import { cn } from '@/shared/utils/cn'
import type { TaskView, TaskType } from '../types'

import { t } from '@/shared/i18n'
const TYPE_ICONS: Record<TaskType, typeof UtensilsCrossed> = {
    nutrition: UtensilsCrossed,
    workout: Dumbbell,
    habit: Star,
    measurement: Ruler,
}

const TYPE_LABELS: Record<TaskType, string> = {
    nutrition: t('curator.task.typeNutrition'),
    workout: t('curator.task.typeWorkout'),
    habit: t('curator.task.typeHabit'),
    measurement: t('curator.task.typeMeasurement'),
}

const STATUS_LABELS: Record<string, string> = {
    active: t('curator.taskCard.statusActive'),
    completed: t('curator.taskCard.statusCompleted'),
    overdue: t('curator.taskCard.statusOverdue'),
}

const STATUS_STYLES: Record<string, string> = {
    active: 'bg-primary-soft text-primary',
    completed: 'bg-success-soft text-success-fg',
    overdue: 'bg-danger-soft text-danger-fg',
}

function getDeadlineColor(deadline: string): string {
    const d = new Date(deadline + 'T23:59:59')
    const now = new Date()
    if (d < now) return 'text-danger-fg'
    const weekFromNow = new Date()
    weekFromNow.setDate(weekFromNow.getDate() + 7)
    if (d <= weekFromNow) return 'text-warning-fg'
    return 'text-fg-muted'
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

    const dayLabels = [
        t('weekdays.short.sun'),
        t('weekdays.short.mon'),
        t('weekdays.short.tue'),
        t('weekdays.short.wed'),
        t('weekdays.short.thu'),
        t('weekdays.short.fri'),
        t('weekdays.short.sat'),
    ]

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
                        <span className="text-[9px] text-fg-subtle">{dayLabels[day.dayOfWeek]}</span>
                        <div
                            className={cn(
                                'h-3 w-3 rounded-full',
                                day.filled
                                    ? 'bg-success'
                                    : scheduled
                                      ? 'border-2 border-success bg-transparent'
                                      : 'bg-subtle',
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
    onEdit?: (task: TaskView) => void
    onDelete?: (taskId: string) => void
}

export function TaskCard({ task, onEdit, onDelete }: TaskCardProps) {
    const Icon = TYPE_ICONS[task.type] ?? Star

    return (
        <div className="rounded-xl bg-surface p-4 shadow-sm border border-line">
            <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-subtle">
                    <Icon className="h-4 w-4 text-fg-muted" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                        <h3 className="text-sm font-semibold text-fg truncate">{task.title}</h3>
                        <div className="flex items-center gap-2 shrink-0">
                            <span
                                className={cn(
                                    'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                                    STATUS_STYLES[task.status] ?? 'bg-subtle text-fg',
                                )}
                            >
                                {STATUS_LABELS[task.status] ?? task.status}
                            </span>
                            {onEdit && (
                                <button
                                    type="button"
                                    onClick={() => onEdit(task)}
                                    className="p-1 text-fg-subtle hover:text-primary transition-colors"
                                    aria-label={t('curator.taskCard.editAria')}
                                >
                                    <Pencil className="h-3.5 w-3.5" />
                                </button>
                            )}
                            {onDelete && (
                                <button
                                    type="button"
                                    onClick={() => onDelete(task.id)}
                                    className="p-1 text-fg-subtle hover:text-danger-fg transition-colors"
                                    aria-label={t('curator.taskCard.deleteAria')}
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-fg-subtle">{TYPE_LABELS[task.type]}</span>
                        <span className={cn('text-xs', getDeadlineColor(task.deadline))}>
                            {t('curator.taskCard.deadline', { date: formatDeadline(task.deadline) })}
                        </span>
                    </div>
                    {task.description && (
                        <p className="mt-1 text-xs text-fg-muted line-clamp-2">{task.description}</p>
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
