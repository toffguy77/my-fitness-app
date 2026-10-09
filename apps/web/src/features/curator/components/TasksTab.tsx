'use client'

import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { cn } from '@/shared/utils/cn'
import { curatorApi } from '../api/curatorApi'
import type { TaskView, TaskStatus } from '../types'
import { TaskCard } from './TaskCard'
import { TaskForm } from './TaskForm'
import { SectionSpinner } from './formSheet'
import { IconButton } from '@/shared/components/ui/Button'

import { t } from '@/shared/i18n'
import toast from 'react-hot-toast'
import { messageForOr } from '@/shared/errors/apiErrors'
const FILTERS: { id: TaskStatus; label: string }[] = [
    { id: 'active', label: t('curator.tasksTab.active') },
    { id: 'completed', label: t('curator.tasksTab.completed') },
    { id: 'overdue', label: t('curator.tasksTab.overdue') },
]

interface TasksTabProps {
    clientId: number
}

export function TasksTab({ clientId }: TasksTabProps) {
    const [tasks, setTasks] = useState<TaskView[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [filter, setFilter] = useState<TaskStatus>('active')
    const [showForm, setShowForm] = useState(false)
    const [editingTask, setEditingTask] = useState<TaskView | undefined>()

    useEffect(() => {
        let cancelled = false

        curatorApi
            .getTasks(clientId, filter)
            .then((data) => {
                if (!cancelled) {
                    setTasks(data)
                    setError(null)
                    setLoading(false)
                }
            })
            .catch((err) => {
                if (!cancelled) {
                    setError(messageForOr(err, t('curator.tasksTab.loadFailed')))
                    setLoading(false)
                }
            })

        return () => {
            cancelled = true
        }
    }, [clientId, filter])

    const handleDelete = async (taskId: string) => {
        try {
            await curatorApi.deleteTask(clientId, taskId)
            setTasks((prev) => prev.filter((t) => t.id !== taskId))
        } catch (err) {
            // То же, что и с планом: молчание превращало отказ в «ничего не
            // произошло», а задача при этом оставалась у клиента.
            toast.error(messageForOr(err, t('curator.tasksTab.deleteFailed')))
        }
    }

    const handleEdit = (task: TaskView) => {
        setEditingTask(task)
        setShowForm(true)
    }

    const handleTaskSaved = (task: TaskView) => {
        if (editingTask) {
            setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)))
        } else if (filter === 'active') {
            setTasks((prev) => [task, ...prev])
        }
        setShowForm(false)
        setEditingTask(undefined)
    }

    const handleFormClose = () => {
        setShowForm(false)
        setEditingTask(undefined)
    }

    return (
        <div className="space-y-4">
            {/* Фильтр из трёх вариантов — сегменты; выбранный — инверсия чернилами. */}
            <div className="inline-flex rounded-full border border-line p-1" role="group">
                {FILTERS.map((f) => (
                    <button
                        key={f.id}
                        type="button"
                        onClick={() => setFilter(f.id)}
                        aria-pressed={filter === f.id}
                        className={cn(
                            'h-9 rounded-full px-4 text-sm font-medium transition-colors',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                            filter === f.id
                                ? 'bg-fg text-fg-inverse'
                                : 'text-fg-muted hover:text-fg',
                        )}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            {loading ? (
                <SectionSpinner />
            ) : error ? (
                <p className="py-8 text-center text-sm text-danger-fg">{error}</p>
            ) : tasks.length === 0 ? (
                <div className="rounded-card border border-dashed border-line px-5 py-8 text-center">
                    <p className="text-sm text-fg-muted">{t('curator.tasksTab.empty')}</p>
                    <button
                        type="button"
                        onClick={() => { setEditingTask(undefined); setShowForm(true) }}
                        className="mt-1 inline-flex min-h-11 items-center px-2 text-sm font-semibold text-primary focus:outline-none focus-visible:underline touch-manipulation"
                    >
                        {t('curator.tasksTab.create')}
                    </button>
                </div>
            ) : (
                <div className="space-y-2">
                    {tasks.map((task) => (
                        <TaskCard key={task.id} task={task} onEdit={handleEdit} onDelete={handleDelete} />
                    ))}
                </div>
            )}

            {/*
                Плавающая кнопка — главное действие вкладки. Держится выше нижней
                навигации (sm:bottom-24, z-50 — тем же способом, что и в дневнике
                питания): при sm:bottom-6 она занимала 640–696 пикселей при
                навигации 656–720, и навигация перехватывала нажатие. Кнопка была
                видна, но не нажималась.
            */}
            <IconButton
                variant="primary"
                size="lg"
                data-testid="create-task-fab"
                onClick={() => { setEditingTask(undefined); setShowForm(true) }}
                className="fixed bottom-20 right-4 z-50 shadow-float sm:bottom-24 sm:right-6 sm:h-14 sm:w-14"
                aria-label={t('curator.tasksTab.create')}
            >
                <Plus className="h-6 w-6" strokeWidth={2} aria-hidden="true" />
            </IconButton>

            {showForm && (
                <TaskForm
                    clientId={clientId}
                    onClose={handleFormClose}
                    onSaved={handleTaskSaved}
                    existingTask={editingTask}
                />
            )}
        </div>
    )
}
