'use client'

import { useState } from 'react'
import Link from 'next/link'
import { SettingsPageLayout } from './SettingsPageLayout'
import { recalculate } from '@/features/nutrition-calc/api/nutritionCalc'
import type { FullProfile } from '../api/settings'
import toast from 'react-hot-toast'
import { t } from '@/shared/i18n'
import { messageForOr } from '@/shared/errors/apiErrors'
import { Check, ChevronDown } from 'lucide-react'
import { Button } from '@/shared/components/ui/Button'
import { Input } from '@/shared/components/ui/Input'
import { fieldClass, fieldLabelClass } from '@/shared/components/forms/fieldStyles'
import { cn } from '@/shared/utils/cn'

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
            } catch (err) {
                // Раньше здесь молчали с объяснением «профиль мог быть заполнен
                // не полностью — это нормально». Объяснение неверное: на
                // незаполненный профиль сервер отвечает 200 и {targets: null},
                // отказа не происходит. Значит, сюда попадает только настоящий
                // сбой — и молчать о нём означает показать «Сохранено» человеку,
                // у которого нормы остались прежними.
                toast.error(messageForOr(err, t('settings.body.recalculateFailed')))
            }
        } catch {
            // Молчим намеренно: saveSettings сам показывает причину отказа и
            // пробрасывает ошибку дальше только чтобы снять состояние
            // «сохраняем». Второй тост сказал бы то же самое дважды.
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="flex flex-col gap-6">
            <Input
                id="settings-birth-date"
                label={t('settings.body.birthDate')}
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
            />

            {/* Biological sex — два варианта, сегменты; выбранный — чернилами. */}
            <fieldset>
                <legend className={fieldLabelClass}>{t('settings.body.sex')}</legend>
                <div className="grid grid-cols-2 gap-1 rounded-full border border-line bg-surface p-1">
                    {([
                        { value: 'male', label: t('settings.body.male') },
                        { value: 'female', label: t('settings.body.female') },
                    ] as const).map((option) => (
                        <label
                            key={option.value}
                            className={cn(
                                'flex h-11 cursor-pointer items-center justify-center rounded-full px-3 text-sm font-semibold transition-colors',
                                'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus',
                                biologicalSex === option.value ? 'bg-fg text-fg-inverse' : 'text-fg-muted hover:text-fg'
                            )}
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
            </fieldset>

            <Input
                id="settings-body-height"
                label={t('settings.body.height')}
                type="number"
                inputMode="decimal"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                placeholder="175"
                min={50}
                max={300}
                step={0.1}
            />

            {/* Current weight (read-only) */}
            <div>
                <p className={fieldLabelClass}>{t('settings.body.currentWeight')}</p>
                <p className="text-base text-fg">
                    {t('settings.body.enterWeightOn')}{' '}
                    <Link href="/dashboard" className="font-semibold text-primary hover:underline">
                        {t('settings.body.dashboard')}
                    </Link>
                </p>
            </div>

            <Input
                id="settings-body-target-weight"
                label={t('settings.body.targetWeight')}
                type="number"
                inputMode="decimal"
                value={targetWeight}
                onChange={(e) => setTargetWeight(e.target.value)}
                placeholder="70"
                min={20}
                max={500}
                step={0.1}
            />

            {/* Activity level */}
            <div>
                <label htmlFor="settings-body-activity" className={fieldLabelClass}>
                    {t('settings.body.activityLevel')}
                </label>
                <div className="relative">
                    <select
                        id="settings-body-activity"
                        value={activityLevel}
                        onChange={(e) => setActivityLevel(e.target.value)}
                        className={cn(fieldClass, 'appearance-none truncate pr-11')}
                    >
                        <option value="">{t('settings.body.choose')}</option>
                        {ACTIVITY_LEVELS.map((level) => (
                            <option key={level} value={level}>
                                {t(`settings.activity.${level}`)} — {t(`settings.activityHint.${level}`)}
                            </option>
                        ))}
                    </select>
                    <ChevronDown
                        className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-fg-subtle"
                        strokeWidth={1.8}
                        aria-hidden="true"
                    />
                </div>
            </div>

            {/* Fitness goal — список вариантов одной карточкой, выбранный отмечен галочкой. */}
            <fieldset>
                <legend className={fieldLabelClass}>{t('settings.body.goal')}</legend>
                <div className="overflow-hidden rounded-card border border-line bg-surface divide-y divide-line">
                    {FITNESS_GOALS.map((goal) => {
                        const selected = fitnessGoal === goal
                        return (
                            <label
                                key={goal}
                                className={cn(
                                    'flex min-h-14 cursor-pointer items-center justify-between gap-3 px-4 text-base transition-colors hover:bg-subtle/60',
                                    'has-[:focus-visible]:bg-subtle',
                                    selected ? 'font-semibold text-fg' : 'text-fg'
                                )}
                            >
                                <input
                                    type="radio"
                                    name="fitness_goal"
                                    value={goal}
                                    checked={selected}
                                    onChange={(e) => setFitnessGoal(e.target.value)}
                                    className="sr-only"
                                />
                                {t(`settings.goal.${goal}`)}
                                {selected && (
                                    <Check className="h-5 w-5 shrink-0 text-fg" strokeWidth={2} aria-hidden="true" />
                                )}
                            </label>
                        )
                    })}
                </div>
            </fieldset>

            {/* Save button — единственное главное действие экрана. */}
            <Button type="button" size="lg" block onClick={handleSave} disabled={saving} className="mt-2">
                {saving ? t('settings.saving') : t('settings.save')}
            </Button>
        </div>
    )
}

SettingsBody.displayName = 'SettingsBody'
