'use client'

import { useState } from 'react'
import Link from 'next/link'
import { SettingsPageLayout } from './SettingsPageLayout'
import { recalculate } from '@/features/nutrition-calc/api/nutritionCalc'
import type { FullProfile } from '../api/settings'
import toast from 'react-hot-toast'
import { t } from '@/shared/i18n'

const ACTIVITY_LEVELS = [
    'sedentary',
    'light',
    'moderate',
    'active',
] as const

const FITNESS_GOALS = [
    'loss',
    'maintain',
    'gain',
] as const

export function SettingsBody() {
    return (
        <SettingsPageLayout title={t('settings.titles.body')}>
            {({ profile, saveSettings }) => (
                <BodyForm profile={profile} onSaveSettings={saveSettings} />
            )}
        </SettingsPageLayout>
    )
}

function BodyForm({
    profile,
    onSaveSettings,
}: {
    profile: FullProfile | null
    onSaveSettings: (settings: Record<string, unknown>) => Promise<void>
}) {
    const settings = profile?.settings

    const [birthDate, setBirthDate] = useState(
        settings?.birth_date ? settings.birth_date.slice(0, 10) : ''
    )
    const [biologicalSex, setBiologicalSex] = useState(settings?.biological_sex || '')
    const [height, setHeight] = useState<string>(settings?.height != null ? String(settings.height) : '')
    const [targetWeight, setTargetWeight] = useState<string>(settings?.target_weight != null ? String(settings.target_weight) : '')
    const [activityLevel, setActivityLevel] = useState(settings?.activity_level || '')
    const [fitnessGoal, setFitnessGoal] = useState(settings?.fitness_goal || '')
    const [saving, setSaving] = useState(false)

    async function handleSave() {
        if (!profile) return

        const parsedHeight = height === '' ? null : parseFloat(height)
        if (parsedHeight !== null && (isNaN(parsedHeight) || parsedHeight < 50 || parsedHeight > 300)) {
            toast.error(t('settings.heightRange'))
            return
        }

        const parsedTargetWeight = targetWeight === '' ? null : parseFloat(targetWeight)
        if (parsedTargetWeight !== null && (isNaN(parsedTargetWeight) || parsedTargetWeight < 20 || parsedTargetWeight > 500)) {
            toast.error(t('settings.body.targetWeightRange'))
            return
        }

        setSaving(true)
        try {
            await onSaveSettings({
                language: settings?.language,
                units: settings?.units,
                timezone: settings?.timezone,
                telegram_username: settings?.telegram_username,
                instagram_username: settings?.instagram_username,
                apple_health_enabled: settings?.apple_health_enabled,
                birth_date: birthDate || null,
                biological_sex: biologicalSex || null,
                height: parsedHeight,
                target_weight: parsedTargetWeight,
                activity_level: activityLevel || null,
                fitness_goal: fitnessGoal || null,
            })

            try {
                await recalculate()
                toast.success(t('settings.body.recalculated'))
            } catch {
                // recalculate may fail if not all fields are filled — that's ok
            }
        } catch {
            // saveSettings already shows a toast on error
        } finally {
            setSaving(false)
        }
    }

    return (
        <>
            {/* Birth date */}
            <div className="mb-8">
                <h3 className="mb-3 text-sm font-bold text-gray-900">{t('settings.body.birthDate')}</h3>
                <input
                    type="date"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
                />
            </div>

            {/* Biological sex */}
            <div className="mb-8">
                <h3 className="mb-3 text-sm font-bold text-gray-900">{t('settings.body.sex')}</h3>
                <div className="flex gap-3">
                    {([
                        { value: 'male', label: t('settings.body.male') },
                        { value: 'female', label: t('settings.body.female') },
                    ] as const).map((option) => (
                        <label
                            key={option.value}
                            className={`flex-1 cursor-pointer rounded-lg border px-4 py-3 text-center text-sm font-medium transition-colors ${
                                biologicalSex === option.value
                                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                            }`}
                        >
                            <input
                                type="radio"
                                name="biological_sex"
                                value={option.value}
                                checked={biologicalSex === option.value}
                                onChange={(e) => setBiologicalSex(e.target.value)}
                                className="sr-only"
                            />
                            {option.label}
                        </label>
                    ))}
                </div>
            </div>

            {/* Height */}
            <div className="mb-8">
                <h3 className="mb-3 text-sm font-bold text-gray-900">{t('settings.body.height')}</h3>
                <input
                    type="number"
                    value={height}
                    onChange={(e) => setHeight(e.target.value)}
                    placeholder="175"
                    min={50}
                    max={300}
                    step={0.1}
                    className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
                />
            </div>

            {/* Current weight (read-only) */}
            <div className="mb-8">
                <h3 className="mb-3 text-sm font-bold text-gray-900">{t('settings.body.currentWeight')}</h3>
                <p className="text-sm text-gray-500">
                    {t('settings.body.enterWeightOn')}{' '}
                    <Link href="/dashboard" className="text-blue-600 hover:underline">
                        {t('settings.body.dashboard')}
                    </Link>
                </p>
            </div>

            {/* Target weight */}
            <div className="mb-8">
                <h3 className="mb-3 text-sm font-bold text-gray-900">{t('settings.body.targetWeight')}</h3>
                <input
                    type="number"
                    value={targetWeight}
                    onChange={(e) => setTargetWeight(e.target.value)}
                    placeholder="70"
                    min={20}
                    max={500}
                    step={0.1}
                    className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
                />
            </div>

            {/* Activity level */}
            <div className="mb-8">
                <h3 className="mb-3 text-sm font-bold text-gray-900">{t('settings.body.activityLevel')}</h3>
                <select
                    value={activityLevel}
                    onChange={(e) => setActivityLevel(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
                >
                    <option value="">{t('settings.body.choose')}</option>
                    {ACTIVITY_LEVELS.map((level) => (
                        <option key={level} value={level}>
                            {t(`settings.activity.${level}`)} — {t(`settings.activityHint.${level}`)}
                        </option>
                    ))}
                </select>
            </div>

            {/* Fitness goal */}
            <div className="mb-8">
                <h3 className="mb-3 text-sm font-bold text-gray-900">{t('settings.body.goal')}</h3>
                <div className="flex flex-col gap-2">
                    {FITNESS_GOALS.map((goal) => (
                        <label
                            key={goal}
                            className={`cursor-pointer rounded-lg border px-4 py-3 text-sm font-medium transition-colors ${
                                fitnessGoal === goal
                                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                            }`}
                        >
                            <input
                                type="radio"
                                name="fitness_goal"
                                value={goal}
                                checked={fitnessGoal === goal}
                                onChange={(e) => setFitnessGoal(e.target.value)}
                                className="sr-only"
                            />
                            {t(`settings.goal.${goal}`)}
                        </label>
                    ))}
                </div>
            </div>

            {/* Save button */}
            <button
                onClick={handleSave}
                disabled={saving}
                className="w-full rounded-lg bg-blue-600 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
                {saving ? t('settings.saving') : t('settings.save')}
            </button>
        </>
    )
}

SettingsBody.displayName = 'SettingsBody'
