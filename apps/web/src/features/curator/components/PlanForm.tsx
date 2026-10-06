'use client'

import { useState } from 'react'
import { Button } from '@/shared/components/ui/Button'
import { curatorApi } from '../api/curatorApi'
import type { WeeklyPlanView } from '../types'

import { t } from '@/shared/i18n'
import { messageForOr } from '@/shared/errors/apiErrors'
import { FIELD_CLASS, FORM_ERROR_CLASS, FormSheet, LABEL_CLASS, TEXTAREA_CLASS } from './formSheet'
function getMonday(d: Date): string {
    const date = new Date(d)
    const day = date.getDay()
    const diff = date.getDate() - day + (day === 0 ? -6 : 1)
    date.setDate(diff)
    return date.toISOString().slice(0, 10)
}

function getSunday(d: Date): string {
    const date = new Date(d)
    const day = date.getDay()
    const diff = date.getDate() - day + (day === 0 ? 0 : 7)
    date.setDate(diff)
    return date.toISOString().slice(0, 10)
}

interface PlanFormProps {
    clientId: number
    existingPlan?: WeeklyPlanView
    onClose: () => void
    onSaved: (plan: WeeklyPlanView) => void
}

export function PlanForm({ clientId, existingPlan, onClose, onSaved }: PlanFormProps) {
    const isEdit = !!existingPlan
    const now = new Date()

    const [calories, setCalories] = useState(existingPlan ? String(existingPlan.calories) : '')
    const [protein, setProtein] = useState(existingPlan ? String(existingPlan.protein) : '')
    const [fat, setFat] = useState(existingPlan ? String(existingPlan.fat) : '')
    const [carbs, setCarbs] = useState(existingPlan ? String(existingPlan.carbs) : '')
    const [startDate, setStartDate] = useState(existingPlan?.start_date ?? getMonday(now))
    const [endDate, setEndDate] = useState(existingPlan?.end_date ?? getSunday(now))
    const [comment, setComment] = useState(existingPlan?.comment ?? '')
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)

        const cal = parseFloat(calories)
        const prot = parseFloat(protein)
        const f = parseFloat(fat)
        const carb = parseFloat(carbs)

        if ([cal, prot, f, carb].some((v) => isNaN(v) || v < 0)) {
            setError(t('curator.plan.invalid'))
            return
        }

        setSaving(true)
        try {
            let plan: WeeklyPlanView
            if (isEdit && existingPlan) {
                plan = await curatorApi.updateWeeklyPlan(clientId, existingPlan.id, {
                    calories: cal,
                    protein: prot,
                    fat: f,
                    carbs: carb,
                    comment: comment || undefined,
                })
            } else {
                plan = await curatorApi.createWeeklyPlan(clientId, {
                    calories: cal,
                    protein: prot,
                    fat: f,
                    carbs: carb,
                    start_date: startDate,
                    end_date: endDate,
                    comment: comment || undefined,
                })
            }
            onSaved(plan)
        } catch (err) {
            // «План на эту неделю уже есть» и «клиент больше не ваш» —
            // разные поводы, и оба сервер называет.
            setError(messageForOr(err, t('curator.plan.saveFailed')))
        } finally {
            setSaving(false)
        }
    }

    return (
        <FormSheet title={isEdit ? t('curator.plan.update') : t('curator.plan.create')} onClose={onClose}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className={LABEL_CLASS}>{t('curator.plan.calories')}</label>
                        <input
                            type="number"
                            value={calories}
                            onChange={(e) => setCalories(e.target.value)}
                            className={FIELD_CLASS}
                            inputMode="decimal"
                            required
                            min={0}
                        />
                    </div>
                    <div>
                        <label className={LABEL_CLASS}>{t('curator.plan.proteinGrams')}</label>
                        <input
                            type="number"
                            value={protein}
                            onChange={(e) => setProtein(e.target.value)}
                            className={FIELD_CLASS}
                            inputMode="decimal"
                            required
                            min={0}
                        />
                    </div>
                    <div>
                        <label className={LABEL_CLASS}>{t('curator.plan.fatGrams')}</label>
                        <input
                            type="number"
                            value={fat}
                            onChange={(e) => setFat(e.target.value)}
                            className={FIELD_CLASS}
                            inputMode="decimal"
                            required
                            min={0}
                        />
                    </div>
                    <div>
                        <label className={LABEL_CLASS}>{t('curator.plan.carbsGrams')}</label>
                        <input
                            type="number"
                            value={carbs}
                            onChange={(e) => setCarbs(e.target.value)}
                            className={FIELD_CLASS}
                            inputMode="decimal"
                            required
                            min={0}
                        />
                    </div>
                </div>

                {!isEdit && (
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className={LABEL_CLASS}>{t('curator.plan.startDate')}</label>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className={FIELD_CLASS}
                                required
                            />
                        </div>
                        <div>
                            <label className={LABEL_CLASS}>{t('curator.plan.endDate')}</label>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className={FIELD_CLASS}
                                required
                            />
                        </div>
                    </div>
                )}

                <div>
                    <label className={LABEL_CLASS}>{t('curator.plan.comment')}</label>
                    <textarea
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        rows={2}
                        className={TEXTAREA_CLASS}
                        placeholder={t('curator.plan.optional')}
                    />
                </div>

                {error && <p className={FORM_ERROR_CLASS} role="alert">{error}</p>}

                <Button type="submit" size="lg" block isLoading={saving} className="mt-2">
                    {isEdit ? t('curator.plan.update') : t('curator.plan.create')}
                </Button>
            </form>
        </FormSheet>
    )
}
