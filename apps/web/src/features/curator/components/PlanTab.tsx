'use client'

import { useEffect, useState } from 'react'
import { Loader2, ChevronDown, Plus, Pencil, Trash2 } from 'lucide-react'
import { cn } from '@/shared/utils/cn'
import { curatorApi } from '../api/curatorApi'
import type { WeeklyPlanView } from '../types'
import { PlanForm } from './PlanForm'

import { t } from '@/shared/i18n'
import toast from 'react-hot-toast'
import { messageForOr } from '@/shared/errors/apiErrors'
import { useConfirm } from '@/shared/components/ui'
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
    const { confirm, dialog } = useConfirm()

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
            .catch((err) => {
                if (!cancelled) {
                    setError(messageForOr(err, t('curator.plan.loadFailed')))
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
        } catch (err) {
            // Раньше здесь молчали («silently fail»): куратор жал «удалить»,
            // план оставался на месте, и экран не говорил почему. Строка
            // действительно остаётся — но теперь вместе с причиной.
            toast.error(messageForOr(err, t('curator.plan.deleteFailed')))
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-fg-subtle" />
            </div>
        )
    }

    if (error) {
        return <p className="py-8 text-center text-sm text-danger-fg">{error}</p>
    }

    return (
        <div className="space-y-4">
            {activePlan ? (
                <div className="rounded-xl bg-surface p-4 shadow-sm border border-line">
                    <div className="flex items-center justify-between gap-2">
                        <h3 className="text-sm font-semibold text-fg">{t('curator.plan.current')}</h3>
                        <div className="flex items-center gap-2 shrink-0">
                            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-primary-soft text-primary">
                                {t('curator.plan.active')}
                            </span>
                            <button
                                type="button"
                                onClick={() => {
                                    setEditingPlan(activePlan)
                                    setShowForm(true)
                                }}
                                className="p-1 text-fg-subtle hover:text-primary transition-colors"
                                aria-label={t('curator.plan.editAria')}
                            >
                                <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    confirm({
                                        title: t('curator.plan.deleteConfirm'),
                                        description: t('curator.plan.deleteDescription'),
                                        confirmLabel: t('common.delete'),
                                        onConfirm: () => handleDelete(activePlan.id),
                                    })
                                }}
                                className="p-1 text-fg-subtle hover:text-danger-fg transition-colors"
                                aria-label={t('curator.plan.deleteAria')}
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-center text-xs mt-3">
                        <div>
                            <p className="text-fg-muted">{t('macros.calories')}</p>
                            <p className="font-semibold text-fg">{Math.round(activePlan.calories)}</p>
                        </div>
                        <div>
                            <p className="text-fg-muted">{t('macros.protein')}</p>
                            <p className="font-semibold text-fg">{Math.round(activePlan.protein)}</p>
                        </div>
                        <div>
                            <p className="text-fg-muted">{t('macros.fat')}</p>
                            <p className="font-semibold text-fg">{Math.round(activePlan.fat)}</p>
                        </div>
                        <div>
                            <p className="text-fg-muted">{t('macros.carbs')}</p>
                            <p className="font-semibold text-fg">{Math.round(activePlan.carbs)}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                        <span className="text-xs text-fg-subtle">{t('curator.plan.period')}</span>
                        <span className="text-xs text-fg-muted">
                            {formatDateRu(activePlan.start_date)} — {formatDateRu(activePlan.end_date)}
                        </span>
                    </div>
                    {activePlan.comment && (
                        <p className="mt-1 text-xs text-fg-muted line-clamp-2">{activePlan.comment}</p>
                    )}
                </div>
            ) : (
                <div className="rounded-xl border-2 border-dashed border-line py-6 text-center sm:py-8">
                    <p className="text-sm text-fg-subtle">{t('curator.plan.none')}</p>
                    <button
                        type="button"
                        onClick={() => {
                            setEditingPlan(undefined)
                            setShowForm(true)
                        }}
                        className="mt-1.5 text-xs text-primary hover:text-primary font-medium focus:outline-none focus-visible:underline sm:mt-2 sm:text-sm touch-manipulation"
                    >
                        {t('curator.plan.create')}
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
                className="fixed bottom-20 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-on-primary shadow-lg hover:bg-primary-hover active:scale-95 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 sm:bottom-24 sm:right-6 sm:h-14 sm:w-14 touch-manipulation"
                aria-label={t('curator.plan.createAria')}
            >
                <Plus className="h-5 w-5 sm:h-6 sm:w-6" />
            </button>

            {pastPlans.length > 0 && (
                <section>
                    <button
                        type="button"
                        onClick={() => setShowHistory(!showHistory)}
                        className="flex items-center gap-1.5 text-sm font-medium text-fg hover:text-fg"
                    >
                        <ChevronDown
                            className={cn('h-4 w-4 transition-transform', showHistory && 'rotate-180')}
                        />
                        {t('curator.plan.history', { count: pastPlans.length })}
                    </button>
                    {showHistory && (
                        <div className="mt-2 space-y-2">
                            {pastPlans.map((plan) => (
                                <div
                                    key={plan.id}
                                    className="rounded-lg bg-canvas p-3 border border-line text-xs"
                                >
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-fg-muted">
                                            {formatDateRu(plan.start_date)} — {formatDateRu(plan.end_date)}
                                        </span>
                                    </div>
                                    <p className="text-fg">
                                        {t('curator.plan.macrosInline', {
                                            calories: Math.round(plan.calories),
                                            protein: Math.round(plan.protein),
                                            fat: Math.round(plan.fat),
                                            carbs: Math.round(plan.carbs),
                                        })}
                                    </p>
                                    {plan.comment && (
                                        <p className="mt-1 text-fg-muted italic">{plan.comment}</p>
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

            {dialog}
        </div>
    )
}
