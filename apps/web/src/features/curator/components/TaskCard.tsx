'use client'

import { UtensilsCrossed, Dumbbell, Star, Ruler, Pencil, Trash2 } from 'lucide-react'
import { cn } from '@/shared/utils/cn'
import { IconButton } from '@/shared/components/ui/Button'
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
    active: 'bg-info-soft text-info-fg',
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
        <div className="mt-2 flex items-center gap-1.5">
            {days.map((day) => {
                const scheduled = isScheduled(day.dayOfWeek)
                return (
                    <div key={day.date} className="flex flex-col items-center gap-0.5">
                        <span className="text-[11px] leading-[14px] text-fg-subtle">{dayLabels[day.dayOfWeek]}</span>
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
        <div className="rounded-card border border-line bg-surface p-4">
            <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-tile bg-subtle">
                    <Icon className="h-5 w-5 text-fg-muted" strokeWidth={1.8} aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                        <h3 className="type-headline min-w-0 truncate pt-2.5 text-fg">{task.title}</h3>
                        <div className="flex shrink-0 items-center gap-0.5">
                            <span
                                className={cn(
                                    'mr-1 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                                    STATUS_STYLES[task.status] ?? 'bg-subtle text-fg',
                                )}
                            >
                                {STATUS_LABELS[task.status] ?? task.status}
                            </span>
                            {onEdit && (
                                <IconButton
                                    variant="ghost"
                                    onClick={() => onEdit(task)}
                                    className="text-fg-muted hover:text-fg"
                                    aria-label={t('curator.taskCard.editAria')}
                                >
                                    <Pencil className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                                </IconButton>
                            )}
                            {onDelete && (
                                <IconButton
                                    variant="ghost"
                                    onClick={() => onDelete(task.id)}
                                    className="text-fg-muted hover:bg-danger-soft hover:text-danger-fg"
                                    aria-label={t('curator.taskCard.deleteAria')}
                                >
                                    <Trash2 className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                                </IconButton>
                            )}
                        </div>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-sm">
                        <span className="text-fg-subtle">{TYPE_LABELS[task.type]}</span>
                        <span className={cn('tabular-nums', getDeadlineColor(task.deadline))}>
                            {t('curator.taskCard.deadline', { date: formatDeadline(task.deadline) })}
                        </span>
                    </div>
                    {task.description && (
                        <p className="mt-1 line-clamp-2 text-sm text-fg-muted">{task.description}</p>
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
