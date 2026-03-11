'use client'

import { useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { curatorApi } from '../api/curatorApi'
import type { WeeklyPlanView } from '../types'

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
            setError('Заполните все поля КБЖУ корректно')
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
        } catch {
            setError('Не удалось сохранить план')
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40">
            <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-t-2xl bg-white p-5 pb-20 shadow-xl animate-in slide-in-from-bottom">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-base font-semibold text-gray-900">
                        {isEdit ? 'Обновить план' : 'Создать план'}
                    </h2>
                    <button type="button" onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Калории</label>
                            <input
                                type="number"
                                value={calories}
                                onChange={(e) => setCalories(e.target.value)}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                required
                                min={0}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Белки (г)</label>
                            <input
                                type="number"
                                value={protein}
                                onChange={(e) => setProtein(e.target.value)}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                required
                                min={0}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Жиры (г)</label>
                            <input
                                type="number"
                                value={fat}
                                onChange={(e) => setFat(e.target.value)}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                required
                                min={0}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Углеводы (г)</label>
                            <input
                                type="number"
                                value={carbs}
                                onChange={(e) => setCarbs(e.target.value)}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                required
                                min={0}
                            />
                        </div>
                    </div>

                    {!isEdit && (
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Дата начала</label>
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Дата окончания</label>
                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                    required
                                />
                            </div>
                        </div>
                    )}

                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Комментарий</label>
                        <textarea
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            rows={2}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                            placeholder="Необязательно"
                        />
                    </div>

                    {error && <p className="text-xs text-red-500">{error}</p>}

                    <button
                        type="submit"
                        disabled={saving}
                        className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                    >
                        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                        {isEdit ? 'Обновить план' : 'Создать план'}
                    </button>
                </form>
            </div>
        </div>
    )
}
