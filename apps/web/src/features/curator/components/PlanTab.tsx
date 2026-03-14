'use client'

import { useEffect, useState } from 'react'
import { Loader2, ChevronDown, Plus, Pencil, Trash2 } from 'lucide-react'
import { cn } from '@/shared/utils/cn'
import { curatorApi } from '../api/curatorApi'
import type { WeeklyPlanView } from '../types'
import { PlanForm } from './PlanForm'

function formatDateRu(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00')
    if (isNaN(d.getTime())) return dateStr
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })
}

interface PlanTabProps {
    clientId: number
}

export function PlanTab({ clientId }: PlanTabProps) {
    const [plans, setPlans] = useState<WeeklyPlanView[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [showForm, setShowForm] = useState(false)
    const [editingPlan, setEditingPlan] = useState<WeeklyPlanView | undefined>()
    const [showHistory, setShowHistory] = useState(false)

    useEffect(() => {
        let cancelled = false

        curatorApi
            .getWeeklyPlans(clientId)
            .then((data) => {
                if (!cancelled) {
                    setPlans(data)
                    setError(null)
                    setLoading(false)
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setError('Не удалось загрузить планы')
                    setLoading(false)
                }
            })

        return () => {
            cancelled = true
        }
    }, [clientId])

    const activePlan = plans.find((p) => p.is_active)
    const pastPlans = plans.filter((p) => !p.is_active)

    const handleSaved = (plan: WeeklyPlanView) => {
        setPlans((prev) => {
            const idx = prev.findIndex((p) => p.id === plan.id)
            if (idx >= 0) {
                const updated = [...prev]
                updated[idx] = plan
                return updated
            }
            return [plan, ...prev]
        })
        setShowForm(false)
        setEditingPlan(undefined)
    }

    const handleDelete = async (planId: string) => {
        try {
            await curatorApi.deleteWeeklyPlan(clientId, planId)
            setPlans((prev) => prev.filter((p) => p.id !== planId))
        } catch {
            // silently fail
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
        )
    }

    if (error) {
        return <p className="py-8 text-center text-sm text-red-500">{error}</p>
    }

    return (
        <div className="space-y-4">
            {activePlan ? (
                <div className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between gap-2">
                        <h3 className="text-sm font-semibold text-gray-900">Текущий план</h3>
                        <div className="flex items-center gap-2 shrink-0">
                            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800">
                                Активный
                            </span>
                            <button
                                type="button"
                                onClick={() => {
                                    setEditingPlan(activePlan)
                                    setShowForm(true)
                                }}
                                className="p-1 text-gray-400 hover:text-blue-500 transition-colors"
                                aria-label="Редактировать план"
                            >
                                <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    if (window.confirm('Удалить активный план?')) {
                                        handleDelete(activePlan.id)
                                    }
                                }}
                                className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                                aria-label="Удалить план"
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-center text-xs mt-3">
                        <div>
                            <p className="text-gray-500">Ккал</p>
                            <p className="font-semibold text-gray-900">{Math.round(activePlan.calories)}</p>
                        </div>
                        <div>
                            <p className="text-gray-500">Белки</p>
                            <p className="font-semibold text-gray-900">{Math.round(activePlan.protein)}</p>
                        </div>
                        <div>
                            <p className="text-gray-500">Жиры</p>
                            <p className="font-semibold text-gray-900">{Math.round(activePlan.fat)}</p>
                        </div>
                        <div>
                            <p className="text-gray-500">Углеводы</p>
                            <p className="font-semibold text-gray-900">{Math.round(activePlan.carbs)}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                        <span className="text-xs text-gray-400">Период</span>
                        <span className="text-xs text-gray-500">
                            {formatDateRu(activePlan.start_date)} — {formatDateRu(activePlan.end_date)}
                        </span>
                    </div>
                    {activePlan.comment && (
                        <p className="mt-1 text-xs text-gray-500 line-clamp-2">{activePlan.comment}</p>
                    )}
                </div>
            ) : (
                <div className="rounded-xl border-2 border-dashed border-gray-200 py-6 text-center sm:py-8">
                    <p className="text-sm text-gray-400">Активный план не задан</p>
                    <button
                        type="button"
                        onClick={() => {
                            setEditingPlan(undefined)
                            setShowForm(true)
                        }}
                        className="mt-1.5 text-xs text-blue-500 hover:text-blue-600 font-medium focus:outline-none focus-visible:underline sm:mt-2 sm:text-sm touch-manipulation"
                    >
                        Создать план
                    </button>
                </div>
            )}

            {/* FAB */}
            <button
                type="button"
                onClick={() => {
                    setEditingPlan(undefined)
                    setShowForm(true)
                }}
                className="fixed bottom-20 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 active:scale-95 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:bottom-6 sm:right-6 sm:h-14 sm:w-14 touch-manipulation"
                aria-label="Создать план"
            >
                <Plus className="h-5 w-5 sm:h-6 sm:w-6" />
            </button>

            {pastPlans.length > 0 && (
                <section>
                    <button
                        type="button"
                        onClick={() => setShowHistory(!showHistory)}
                        className="flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-gray-900"
                    >
                        <ChevronDown
                            className={cn('h-4 w-4 transition-transform', showHistory && 'rotate-180')}
                        />
                        История планов ({pastPlans.length})
                    </button>
                    {showHistory && (
                        <div className="mt-2 space-y-2">
                            {pastPlans.map((plan) => (
                                <div
                                    key={plan.id}
                                    className="rounded-lg bg-gray-50 p-3 border border-gray-100 text-xs"
                                >
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-gray-600">
                                            {formatDateRu(plan.start_date)} — {formatDateRu(plan.end_date)}
                                        </span>
                                    </div>
                                    <p className="text-gray-900">
                                        {Math.round(plan.calories)} ккал | Б {Math.round(plan.protein)} | Ж{' '}
                                        {Math.round(plan.fat)} | У {Math.round(plan.carbs)}
                                    </p>
                                    {plan.comment && (
                                        <p className="mt-1 text-gray-500 italic">{plan.comment}</p>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            )}

            {showForm && (
                <PlanForm
                    clientId={clientId}
                    existingPlan={editingPlan}
                    onClose={() => {
                        setShowForm(false)
                        setEditingPlan(undefined)
                    }}
                    onSaved={handleSaved}
                />
            )}
        </div>
    )
}
