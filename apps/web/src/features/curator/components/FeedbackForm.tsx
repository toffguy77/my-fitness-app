'use client'

import { useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { cn } from '@/shared/utils/cn'
import { curatorApi } from '../api/curatorApi'
import type { RatingLevel, CategoryRating } from '../types'

import { t } from '@/shared/i18n'
import { messageForOr } from '@/shared/errors/apiErrors'
const RATING_OPTIONS: { value: RatingLevel; label: string; color: string; selectedBg: string }[] = [
    { value: 'excellent', label: t('curator.feedback.excellent'), color: 'border-success text-success-fg', selectedBg: 'bg-success text-on-primary border-success' },
    { value: 'good', label: t('curator.feedback.good'), color: 'border-warning text-warning-fg', selectedBg: 'bg-warning text-on-primary border-warning' },
    { value: 'needs_improvement', label: t('curator.feedback.needsImprovement'), color: 'border-danger text-danger-fg', selectedBg: 'bg-danger text-on-primary border-danger' },
]

interface CategoryRatingInputProps {
    label: string
    value: CategoryRating | undefined
    onChange: (val: CategoryRating) => void
}

function CategoryRatingInput({ label, value, onChange }: CategoryRatingInputProps) {
    return (
        <div className="space-y-2">
            <label className="block text-xs font-medium text-fg-muted">{label}</label>
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
                className="w-full rounded-lg border border-line px-3 py-1.5 text-xs focus:border-primary focus:ring-1 focus:ring-focus"
                placeholder={t('curator.feedback.commentPlaceholder')}
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
            setError(t('curator.feedback.summaryRequired'))
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
        } catch (err) {
            setError(messageForOr(err, t('curator.feedback.saveFailed')))
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-scrim">
            <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-t-2xl bg-surface p-5 pb-20 shadow-xl animate-in slide-in-from-bottom">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-base font-semibold text-fg">{t('curator.feedback.heading')}</h2>
                    <button type="button" onClick={onClose} className="p-1 text-fg-subtle hover:text-fg-muted">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <CategoryRatingInput label={t('curator.feedback.nutrition')} value={nutrition} onChange={setNutrition} />
                    <CategoryRatingInput label={t('curator.feedback.activity')} value={activity} onChange={setActivity} />
                    <CategoryRatingInput label={t('curator.feedback.water')} value={water} onChange={setWater} />

                    <label className="flex items-center gap-2 text-xs text-fg-muted">
                        <input
                            type="checkbox"
                            checked={photoUploaded}
                            onChange={(e) => setPhotoUploaded(e.target.checked)}
                            className="rounded border-line text-primary focus:ring-focus"
                        />
                        {t('curator.feedback.photoUploaded')}
                    </label>

                    <div>
                        <label className="block text-xs font-medium text-fg-muted mb-1">{t('curator.feedback.summary')}</label>
                        <textarea
                            value={summary}
                            onChange={(e) => setSummary(e.target.value)}
                            rows={3}
                            className="w-full rounded-lg border border-line px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-focus"
                            required
                            placeholder={t('curator.feedback.summaryPlaceholder')}
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-fg-muted mb-1">{t('curator.feedback.recommendations')}</label>
                        <textarea
                            value={recommendations}
                            onChange={(e) => setRecommendations(e.target.value)}
                            rows={2}
                            className="w-full rounded-lg border border-line px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-focus"
                            placeholder={t('curator.feedback.optional')}
                        />
                    </div>

                    {error && <p className="text-xs text-danger-fg">{error}</p>}

                    <button
                        type="submit"
                        disabled={saving}
                        className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                    >
                        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                        {t('curator.feedback.submit')}
                    </button>
                </form>
            </div>
        </div>
    )
}
