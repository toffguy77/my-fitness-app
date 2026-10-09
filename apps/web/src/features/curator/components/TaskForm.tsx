'use client'

import { useState } from 'react'
import { cn } from '@/shared/utils/cn'
import { Button } from '@/shared/components/ui/Button'
import { curatorApi } from '../api/curatorApi'
import type { TaskView, TaskType, TaskRecurrence } from '../types'

import { t } from '@/shared/i18n'
import { messageForOr } from '@/shared/errors/apiErrors'
import { FIELD_CLASS, FORM_ERROR_CLASS, FormSheet, LABEL_CLASS, TEXTAREA_CLASS } from './formSheet'
const TYPE_OPTIONS: { value: TaskType; label: string }[] = [
    { value: 'nutrition', label: t('curator.task.typeNutrition') },
    { value: 'workout', label: t('curator.task.typeWorkout') },
    { value: 'habit', label: t('curator.task.typeHabit') },
    { value: 'measurement', label: t('curator.task.typeMeasurement') },
]

const RECURRENCE_OPTIONS: { value: TaskRecurrence; label: string }[] = [
    { value: 'once', label: t('curator.task.once') },
    { value: 'daily', label: t('curator.task.daily') },
    { value: 'weekly', label: t('curator.task.weekly') },
]

const WEEKDAYS = [
    { value: 1, label: t('weekdays.short.mon') },
    { value: 2, label: t('weekdays.short.tue') },
    { value: 3, label: t('weekdays.short.wed') },
    { value: 4, label: t('weekdays.short.thu') },
    { value: 5, label: t('weekdays.short.fri') },
    { value: 6, label: t('weekdays.short.sat') },
    { value: 0, label: t('weekdays.short.sun') },
]

interface TaskFormProps {
    clientId: number
    onClose: () => void
    onSaved: (task: TaskView) => void
    existingTask?: TaskView
}

export function TaskForm({ clientId, onClose, onSaved, existingTask }: TaskFormProps) {
    const isEdit = !!existingTask
    const [title, setTitle] = useState(existingTask?.title ?? '')
    const [type, setType] = useState<TaskType>(existingTask?.type ?? 'nutrition')
    const [description, setDescription] = useState(existingTask?.description ?? '')
    const [deadline, setDeadline] = useState(existingTask?.deadline ?? '')
    const [recurrence, setRecurrence] = useState<TaskRecurrence>(existingTask?.recurrence ?? 'once')
    const [recurrenceDays, setRecurrenceDays] = useState<number[]>(existingTask?.recurrence_days ?? [])
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const toggleDay = (day: number) => {
        setRecurrenceDays((prev) =>
            prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
        )
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)

        if (!title.trim()) {
            setError(t('curator.task.titleRequired'))
            return
        }
        if (!deadline) {
            setError(t('curator.task.deadlineRequired'))
            return
        }

        setSaving(true)
        try {
            let task: TaskView
            if (isEdit) {
                task = await curatorApi.updateTask(clientId, existingTask.id, {
                    title: title.trim(),
                    description: description.trim() || undefined,
                    deadline,
                })
            } else {
                task = await curatorApi.createTask(clientId, {
                    title: title.trim(),
                    type,
                    description: description.trim() || undefined,
                    deadline,
                    recurrence,
                    recurrence_days: recurrence === 'weekly' ? recurrenceDays : undefined,
                })
            }
            onSaved(task)
        } catch (err) {
            setError(messageForOr(err, isEdit ? t('curator.task.updateFailed') : t('curator.task.createFailed')))
        } finally {
            setSaving(false)
        }
    }

    return (
        <FormSheet title={isEdit ? t('curator.task.editHeading') : t('curator.task.newHeading')} onClose={onClose}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className={LABEL_CLASS}>{t('curator.task.name')}</label>
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className={FIELD_CLASS}
                        required
                        placeholder={t('curator.task.namePlaceholder')}
                    />
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className={LABEL_CLASS}>{t('curator.task.type')}</label>
                        <select
                            value={type}
                            onChange={(e) => setType(e.target.value as TaskType)}
                            disabled={isEdit}
                            className={FIELD_CLASS}
                        >
                            {TYPE_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className={LABEL_CLASS}>{t('curator.task.deadline')}</label>
                        <input
                            type="date"
                            value={deadline}
                            onChange={(e) => setDeadline(e.target.value)}
                            className={FIELD_CLASS}
                            required
                        />
                    </div>
                </div>

                <div>
                    <label className={LABEL_CLASS}>{t('curator.task.description')}</label>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={2}
                        className={TEXTAREA_CLASS}
                        placeholder={t('curator.task.descriptionPlaceholder')}
                    />
                </div>

                <div>
                    <label className={LABEL_CLASS}>{t('curator.task.recurrence')}</label>
                    <select
                        value={recurrence}
                        onChange={(e) => setRecurrence(e.target.value as TaskRecurrence)}
                        disabled={isEdit}
                        className={FIELD_CLASS}
                    >
                        {RECURRENCE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                </div>

                {recurrence === 'weekly' && (
                    <div>
                        <label className={LABEL_CLASS}>{t('curator.task.weekdays')}</label>
                        {/* Выбранный день — инверсия чернилами, а не терракота:
                            бренд на экране только у главного действия. */}
                        <div className="flex flex-wrap gap-1.5">
                            {WEEKDAYS.map((day) => {
                                const selected = recurrenceDays.includes(day.value)
                                return (
                                    <button
                                        key={day.value}
                                        type="button"
                                        onClick={() => toggleDay(day.value)}
                                        aria-pressed={selected}
                                        className={cn(
                                            'flex h-11 w-11 items-center justify-center rounded-full text-sm font-medium transition-colors',
                                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2',
                                            selected
                                                ? 'bg-fg text-fg-inverse'
                                                : 'bg-subtle text-fg-muted hover:text-fg',
                                        )}
                                    >
                                        {day.label}
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                )}

                {error && <p className={FORM_ERROR_CLASS} role="alert">{error}</p>}

                <Button type="submit" size="lg" block isLoading={saving} className="mt-2">
                    {isEdit ? t('common.save') : t('curator.task.create')}
                </Button>
            </form>
        </FormSheet>
    )
}
