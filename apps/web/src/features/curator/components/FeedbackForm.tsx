'use client'

import { useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { cn } from '@/shared/utils/cn'
import { curatorApi } from '../api/curatorApi'
import type { RatingLevel, CategoryRating } from '../types'

const RATING_OPTIONS: { value: RatingLevel; label: string; color: string; selectedBg: string }[] = [
    { value: 'excellent', label: 'Отлично', color: 'border-green-500 text-green-700', selectedBg: 'bg-green-500 text-white border-green-500' },
    { value: 'good', label: 'Хорошо', color: 'border-yellow-500 text-yellow-700', selectedBg: 'bg-yellow-500 text-white border-yellow-500' },
    { value: 'needs_improvement', label: 'Нужно улучшить', color: 'border-red-500 text-red-700', selectedBg: 'bg-red-500 text-white border-red-500' },
]

interface CategoryRatingInputProps {
    label: string
    value: CategoryRating | undefined
    onChange: (val: CategoryRating) => void
}

function CategoryRatingInput({ label, value, onChange }: CategoryRatingInputProps) {
    return (
        <div className="space-y-2">
            <label className="block text-xs font-medium text-gray-600">{label}</label>
            <div className="flex gap-2">
                {RATING_OPTIONS.map((opt) => (
                    <button
                        key={opt.value}
                        type="button"
                        onClick={() => onChange({ ...value, rating: opt.value, comment: value?.comment })}
                        className={cn(
                            'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                            value?.rating === opt.value ? opt.selectedBg : opt.color,
                        )}
                    >
                        {opt.label}
                    </button>
                ))}
            </div>
            <textarea
                value={value?.comment ?? ''}
                onChange={(e) => onChange({ rating: value?.rating ?? 'good', comment: e.target.value })}
                rows={1}
                className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder="Комментарий (необязательно)"
            />
        </div>
    )
}

interface FeedbackFormProps {
    clientId: number
    reportId: string
    onClose: () => void
    onSaved: () => void
}

export function FeedbackForm({ clientId, reportId, onClose, onSaved }: FeedbackFormProps) {
    const [nutrition, setNutrition] = useState<CategoryRating | undefined>()
    const [activity, setActivity] = useState<CategoryRating | undefined>()
    const [water, setWater] = useState<CategoryRating | undefined>()
    const [photoUploaded, setPhotoUploaded] = useState(false)
    const [summary, setSummary] = useState('')
    const [recommendations, setRecommendations] = useState('')
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)

        if (!summary.trim()) {
            setError('Заполните итог')
            return
        }

        setSaving(true)
        try {
            await curatorApi.submitFeedback(clientId, reportId, {
                nutrition,
                activity,
                water,
                photo_uploaded: photoUploaded,
                summary: summary.trim(),
                recommendations: recommendations.trim() || undefined,
            })
            onSaved()
        } catch {
            setError('Не удалось сохранить обратную связь')
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
            <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-t-2xl bg-white p-5 pb-8 shadow-xl animate-in slide-in-from-bottom">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-base font-semibold text-gray-900">Обратная связь</h2>
                    <button type="button" onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <CategoryRatingInput label="Питание" value={nutrition} onChange={setNutrition} />
                    <CategoryRatingInput label="Активность" value={activity} onChange={setActivity} />
                    <CategoryRatingInput label="Вода" value={water} onChange={setWater} />

                    <label className="flex items-center gap-2 text-xs text-gray-600">
                        <input
                            type="checkbox"
                            checked={photoUploaded}
                            onChange={(e) => setPhotoUploaded(e.target.checked)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        Фото загружено
                    </label>

                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Итог</label>
                        <textarea
                            value={summary}
                            onChange={(e) => setSummary(e.target.value)}
                            rows={3}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                            required
                            placeholder="Общий итог по неделе"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Рекомендации</label>
                        <textarea
                            value={recommendations}
                            onChange={(e) => setRecommendations(e.target.value)}
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
                        Отправить обратную связь
                    </button>
                </form>
            </div>
        </div>
    )
}
