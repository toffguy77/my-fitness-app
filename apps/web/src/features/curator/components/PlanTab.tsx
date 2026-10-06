'use client'

import { useEffect, useState } from 'react'
import { ChevronDown, Plus, Pencil, Trash2 } from 'lucide-react'
import { cn } from '@/shared/utils/cn'
import { curatorApi } from '../api/curatorApi'
import type { WeeklyPlanView } from '../types'
import { PlanForm } from './PlanForm'
import { SectionSpinner } from './formSheet'
import { IconButton } from '@/shared/components/ui/Button'
import { Card, CardTitle } from '@/shared/components/ui/Card'
import { MACRO_TEXT_COLORS } from '@/shared/constants/macros'

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
        return <SectionSpinner />
    }

    if (error) {
        return <p className="py-8 text-center text-sm text-danger-fg">{error}</p>
    }

    return (
        <div className="space-y-4">
            {activePlan ? (
                <Card>
                    <div className="flex items-center justify-between gap-2">
                        <CardTitle>{t('curator.plan.current')}</CardTitle>
                        <div className="flex shrink-0 items-center gap-1">
                            <span className="mr-1 inline-flex items-center rounded-full bg-info-soft px-2.5 py-0.5 text-xs font-medium text-info-fg">
                                {t('curator.plan.active')}
                            </span>
                            <IconButton
                                variant="ghost"
                                onClick={() => {
                                    setEditingPlan(activePlan)
                                    setShowForm(true)
                                }}
                                className="text-fg-muted hover:text-fg"
                                aria-label={t('curator.plan.editAria')}
                            >
                                <Pencil className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                            </IconButton>
                            <IconButton
                                variant="ghost"
                                onClick={() => {
                                    confirm({
                                        title: t('curator.plan.deleteConfirm'),
                                        description: t('curator.plan.deleteDescription'),
                                        confirmLabel: t('common.delete'),
                                        onConfirm: () => handleDelete(activePlan.id),
                                    })
                                }}
                                className="text-fg-muted hover:bg-danger-soft hover:text-danger-fg"
                                aria-label={t('curator.plan.deleteAria')}
                            >
                                <Trash2 className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                            </IconButton>
                        </div>
                    </div>
                    <dl className="mt-4 grid grid-cols-4 gap-2 text-center">
                        <div>
                            <dt className="text-xs text-fg-muted">{t('macros.calories')}</dt>
                            <dd className="type-num-l tabular-nums text-fg">{Math.round(activePlan.calories)}</dd>
                        </div>
                        <div>
                            <dt className="text-xs text-fg-muted">{t('macros.protein')}</dt>
                            <dd className="type-num-l tabular-nums" style={{ color: MACRO_TEXT_COLORS.protein }}>{Math.round(activePlan.protein)}</dd>
                        </div>
                        <div>
                            <dt className="text-xs text-fg-muted">{t('macros.fat')}</dt>
                            <dd className="type-num-l tabular-nums" style={{ color: MACRO_TEXT_COLORS.fat }}>{Math.round(activePlan.fat)}</dd>
                        </div>
                        <div>
                            <dt className="text-xs text-fg-muted">{t('macros.carbs')}</dt>
                            <dd className="type-num-l tabular-nums" style={{ color: MACRO_TEXT_COLORS.carbs }}>{Math.round(activePlan.carbs)}</dd>
                        </div>
                    </dl>
                    <div className="mt-3 flex items-center gap-2 text-sm">
                        <span className="text-fg-subtle">{t('curator.plan.period')}</span>
                        <span className="tabular-nums text-fg-muted">
                            {formatDateRu(activePlan.start_date)} — {formatDateRu(activePlan.end_date)}
                        </span>
                    </div>
                    {activePlan.comment && (
                        <p className="mt-1 line-clamp-2 text-sm text-fg-muted">{activePlan.comment}</p>
                    )}
                </Card>
            ) : (
                <div className="rounded-card border border-dashed border-line px-5 py-8 text-center">
                    <p className="text-sm text-fg-muted">{t('curator.plan.none')}</p>
                    <button
                        type="button"
                        onClick={() => {
                            setEditingPlan(undefined)
                            setShowForm(true)
                        }}
                        className="mt-1 inline-flex min-h-11 items-center px-2 text-sm font-semibold text-primary focus:outline-none focus-visible:underline touch-manipulation"
                    >
                        {t('curator.plan.create')}
                    </button>
                </div>
            )}

            {/* Плавающая кнопка — главное действие вкладки. */}
            <IconButton
                variant="primary"
                size="lg"
                onClick={() => {
                    setEditingPlan(undefined)
                    setShowForm(true)
                }}
                className="fixed bottom-20 right-4 z-50 shadow-float sm:bottom-24 sm:right-6 sm:h-14 sm:w-14"
                aria-label={t('curator.plan.createAria')}
            >
                <Plus className="h-6 w-6" strokeWidth={2} aria-hidden="true" />
            </IconButton>

            {pastPlans.length > 0 && (
                <section>
                    <button
                        type="button"
                        onClick={() => setShowHistory(!showHistory)}
                        aria-expanded={showHistory}
                        className="flex min-h-11 items-center gap-1.5 text-sm font-semibold text-fg"
                    >
                        <ChevronDown
                            className={cn('h-4 w-4 text-fg-subtle transition-transform', showHistory && 'rotate-180')}
                            aria-hidden="true"
                        />
                        {t('curator.plan.history', { count: pastPlans.length })}
                    </button>
                    {showHistory && (
                        <ul className="mt-2 divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
                            {pastPlans.map((plan) => (
                                <li key={plan.id} className="px-4 py-3 text-sm">
                                    <p className="mb-0.5 text-xs tabular-nums text-fg-muted">
                                        {formatDateRu(plan.start_date)} — {formatDateRu(plan.end_date)}
                                    </p>
                                    <p className="tabular-nums text-fg">
                                        {t('curator.plan.macrosInline', {
                                            calories: Math.round(plan.calories),
                                            protein: Math.round(plan.protein),
                                            fat: Math.round(plan.fat),
                                            carbs: Math.round(plan.carbs),
                                        })}
                                    </p>
                                    {plan.comment && (
                                        <p className="mt-1 italic text-fg-muted">{plan.comment}</p>
                                    )}
                                </li>
                            ))}
                        </ul>
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
