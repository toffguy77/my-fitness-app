'use client'

import { useState } from 'react'
import { cn } from '@/shared/utils/cn'
import { Button } from '@/shared/components/ui/Button'
import { Checkbox } from '@/shared/components/ui/Checkbox'
import { curatorApi } from '../api/curatorApi'
import type { RatingLevel, CategoryRating } from '../types'

import { t } from '@/shared/i18n'
import { messageForOr } from '@/shared/errors/apiErrors'
import { FORM_ERROR_CLASS, FormSheet, LABEL_CLASS, TEXTAREA_CLASS } from './formSheet'
/**
 * Оценка — статус, поэтому выбранная оценка окрашена ролью состояния
 * (`success`/`warning`/`danger` с `-soft` подложкой), а невыбранные — нейтральный
 * контур: цвет появляется только у того, что куратор действительно сказал.
 */
const RATING_OPTIONS: { value: RatingLevel; label: string; selected: string }[] = [
    { value: 'excellent', label: t('curator.feedback.excellent'), selected: 'border-success bg-success-soft text-success-fg' },
    { value: 'good', label: t('curator.feedback.good'), selected: 'border-warning bg-warning-soft text-warning-fg' },
    { value: 'needs_improvement', label: t('curator.feedback.needsImprovement'), selected: 'border-danger bg-danger-soft text-danger-fg' },
]

interface CategoryRatingInputProps {
    label: string
    value: CategoryRating | undefined
    onChange: (val: CategoryRating) => void
}

function CategoryRatingInput({ label, value, onChange }: CategoryRatingInputProps) {
    return (
        <div className="space-y-2">
            <label className="block text-sm font-medium text-fg-muted">{label}</label>
            <div className="flex flex-wrap gap-2">
                {RATING_OPTIONS.map((opt) => {
                    const selected = value?.rating === opt.value
                    return (
                        <button
                            key={opt.value}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => onChange({ ...value, rating: opt.value, comment: value?.comment })}
                            className={cn(
                                'inline-flex h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors',
                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2',
                                selected ? opt.selected : 'border-line text-fg-muted hover:bg-subtle hover:text-fg',
                            )}
                        >
                            {opt.label}
                        </button>
                    )
                })}
            </div>
            <textarea
                value={value?.comment ?? ''}
                onChange={(e) => onChange({ rating: value?.rating ?? 'good', comment: e.target.value })}
                rows={1}
                className={TEXTAREA_CLASS}
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
        <FormSheet title={t('curator.feedback.heading')} onClose={onClose}>
            <form onSubmit={handleSubmit} className="space-y-5">
                <CategoryRatingInput label={t('curator.feedback.nutrition')} value={nutrition} onChange={setNutrition} />
                <CategoryRatingInput label={t('curator.feedback.activity')} value={activity} onChange={setActivity} />
                <CategoryRatingInput label={t('curator.feedback.water')} value={water} onChange={setWater} />

                <Checkbox
                    checked={photoUploaded}
                    onChange={(e) => setPhotoUploaded(e.target.checked)}
                    label={t('curator.feedback.photoUploaded')}
                />

                <div>
                    <label className={LABEL_CLASS}>{t('curator.feedback.summary')}</label>
                    <textarea
                        value={summary}
                        onChange={(e) => setSummary(e.target.value)}
                        rows={3}
                        className={TEXTAREA_CLASS}
                        required
                        placeholder={t('curator.feedback.summaryPlaceholder')}
                    />
                </div>

                <div>
                    <label className={LABEL_CLASS}>{t('curator.feedback.recommendations')}</label>
                    <textarea
                        value={recommendations}
                        onChange={(e) => setRecommendations(e.target.value)}
                        rows={2}
                        className={TEXTAREA_CLASS}
                        placeholder={t('curator.feedback.optional')}
                    />
                </div>

                {error && <p className={FORM_ERROR_CLASS} role="alert">{error}</p>}

                <Button type="submit" size="lg" block isLoading={saving}>
                    {t('curator.feedback.submit')}
                </Button>
            </form>
        </FormSheet>
    )
}
