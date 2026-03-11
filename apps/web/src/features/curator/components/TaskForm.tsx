'use client'

import { useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { cn } from '@/shared/utils/cn'
import { curatorApi } from '../api/curatorApi'
import type { TaskView, TaskType, TaskRecurrence } from '../types'

const TYPE_OPTIONS: { value: TaskType; label: string }[] = [
    { value: 'nutrition', label: 'Питание' },
    { value: 'workout', label: 'Тренировка' },
    { value: 'habit', label: 'Привычка' },
    { value: 'measurement', label: 'Замеры' },
]

const RECURRENCE_OPTIONS: { value: TaskRecurrence; label: string }[] = [
    { value: 'once', label: 'Однократно' },
    { value: 'daily', label: 'Ежедневно' },
    { value: 'weekly', label: 'Еженедельно' },
]

const WEEKDAYS = [
    { value: 1, label: 'Пн' },
    { value: 2, label: 'Вт' },
    { value: 3, label: 'Ср' },
    { value: 4, label: 'Чт' },
    { value: 5, label: 'Пт' },
    { value: 6, label: 'Сб' },
    { value: 0, label: 'Вс' },
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
            setError('Укажите название задачи')
            return
        }
        if (!deadline) {
            setError('Укажите дедлайн')
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
        } catch {
            setError(isEdit ? 'Не удалось обновить задачу' : 'Не удалось создать задачу')
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40">
            <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-t-2xl bg-white p-5 pb-20 shadow-xl animate-in slide-in-from-bottom">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-base font-semibold text-gray-900">{isEdit ? 'Редактировать задачу' : 'Новая задача'}</h2>
                    <button type="button" onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-3">
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Название</label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                            required
                            placeholder="Что нужно сделать?"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Тип</label>
                            <select
                                value={type}
                                onChange={(e) => setType(e.target.value as TaskType)}
                                disabled={isEdit}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-60"
                            >
                                {TYPE_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Дедлайн</label>
                            <input
                                type="date"
                                value={deadline}
                                onChange={(e) => setDeadline(e.target.value)}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Описание</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={2}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                            placeholder="Необязательно"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Повторение</label>
                        <select
                            value={recurrence}
                            onChange={(e) => setRecurrence(e.target.value as TaskRecurrence)}
                            disabled={isEdit}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-60"
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
                            <label className="block text-xs font-medium text-gray-600 mb-1">Дни недели</label>
                            <div className="flex gap-1.5">
                                {WEEKDAYS.map((day) => (
                                    <button
                                        key={day.value}
                                        type="button"
                                        onClick={() => toggleDay(day.value)}
                                        className={cn(
                                            'flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium transition-colors',
                                            recurrenceDays.includes(day.value)
                                                ? 'bg-blue-600 text-white'
                                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
                                        )}
                                    >
                                        {day.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {error && <p className="text-xs text-red-500">{error}</p>}

                    <button
                        type="submit"
                        disabled={saving}
                        className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                    >
                        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                        {isEdit ? 'Сохранить' : 'Создать задачу'}
                    </button>
                </form>
            </div>
        </div>
    )
}
