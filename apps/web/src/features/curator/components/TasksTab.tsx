'use client'

import { useEffect, useState } from 'react'
import { Loader2, Plus } from 'lucide-react'
import { cn } from '@/shared/utils/cn'
import { curatorApi } from '../api/curatorApi'
import type { TaskView, TaskStatus } from '../types'
import { TaskCard } from './TaskCard'
import { TaskForm } from './TaskForm'

const FILTERS: { id: TaskStatus; label: string }[] = [
    { id: 'active', label: 'Активные' },
    { id: 'completed', label: 'Завершённые' },
    { id: 'overdue', label: 'Просроченные' },
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
            .catch(() => {
                if (!cancelled) {
                    setError('Не удалось загрузить задачи')
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
        } catch {
            // silently fail
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
            {/* Filters */}
            <div className="flex gap-2">
                {FILTERS.map((f) => (
                    <button
                        key={f.id}
                        type="button"
                        onClick={() => setFilter(f.id)}
                        className={cn(
                            'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                            filter === f.id
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
                        )}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                </div>
            ) : error ? (
                <p className="py-8 text-center text-sm text-red-500">{error}</p>
            ) : tasks.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed border-gray-200 py-6 text-center sm:py-8">
                    <p className="text-sm text-gray-400">Нет задач</p>
                    <button
                        type="button"
                        onClick={() => setShowForm(true)}
                        className="mt-1.5 text-xs text-blue-500 hover:text-blue-600 font-medium focus:outline-none focus-visible:underline sm:mt-2 sm:text-sm touch-manipulation"
                    >
                        Создать задачу
                    </button>
                </div>
            ) : (
                <div className="space-y-2">
                    {tasks.map((task) => (
                        <TaskCard key={task.id} task={task} onEdit={handleEdit} onDelete={handleDelete} />
                    ))}
                </div>
            )}

            {/* FAB */}
            <button
                type="button"
                onClick={() => setShowForm(true)}
                className="fixed bottom-20 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 active:scale-95 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:bottom-6 sm:right-6 sm:h-14 sm:w-14 touch-manipulation"
                aria-label="Создать задачу"
            >
                <Plus className="h-5 w-5 sm:h-6 sm:w-6" />
            </button>

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
