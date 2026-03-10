'use client'

import { useEffect, useState } from 'react'
import { Loader2, ChevronDown, Plus, Pencil } from 'lucide-react'
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
                <section className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-sm font-semibold text-gray-900">Текущий план</h2>
                        <button
                            type="button"
                            onClick={() => {
                                setEditingPlan(activePlan)
                                setShowForm(true)
                            }}
                            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                        >
                            <Pencil className="h-3.5 w-3.5" />
                            Скорректировать
                        </button>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-center text-xs">
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
                    <p className="mt-2 text-xs text-gray-500">
                        {formatDateRu(activePlan.start_date)} — {formatDateRu(activePlan.end_date)}
                    </p>
                    {activePlan.comment && (
                        <p className="mt-1 text-xs text-gray-500 italic">{activePlan.comment}</p>
                    )}
                </section>
            ) : (
                <div className="rounded-xl border-2 border-dashed border-gray-200 p-6 text-center">
                    <p className="text-sm text-gray-500 mb-3">Активный план не задан</p>
                    <button
                        type="button"
                        onClick={() => {
                            setEditingPlan(undefined)
                            setShowForm(true)
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
                    >
                        <Plus className="h-4 w-4" />
                        Создать план
                    </button>
                </div>
            )}

            {activePlan && (
                <button
                    type="button"
                    onClick={() => {
                        setEditingPlan(undefined)
                        setShowForm(true)
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
                >
                    <Plus className="h-4 w-4" />
                    Новый план
                </button>
            )}

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
