/**
 * WeightBlock component for daily weight tracking
 *
 * Displays input field for weight entry, shows previous weight for comparison,
 * quick add functionality, completion indicator, and validation.
 *
 * Дизайн-система: вес — главным числом, изменение с вчера — нейтрально
 * (стрелка и знак, без оценки цветом: «лучше» или «хуже» зависит от цели
 * человека, а не от направления), записанный вес — состояние успеха.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7
 *
 * Performance optimizations:
 * - React.memo to prevent unnecessary re-renders
 * - Debounced input validation (300ms)
 */

import { useState, useCallback, memo, useMemo, useEffect } from 'react'
import { Plus, Pencil, Check, TrendingUp, TrendingDown, Minus, Target } from 'lucide-react'
import { Card, CardTitle } from '@/shared/components/ui/Card'
import { Button, IconButton } from '@/shared/components/ui/Button'
import { Input } from '@/shared/components/ui/Input'
import { cn } from '@/shared/utils/cn'
import { useDashboardStore } from '../store/dashboardStore'
import { formatLocalDate, formatDecimal } from '@/shared/utils/format'
import { validateWeight } from '../utils/validation'
import { useDebouncedCallback } from '@/shared/hooks/useDebounce'
import { AttentionBadge } from './AttentionBadge'
import { getProfile } from '@/features/settings/api/settings'
import toast from 'react-hot-toast'
import { t } from '@/shared/i18n'

/**
 * Props for WeightBlock component
 */
export interface WeightBlockProps {
    date: Date
    className?: string
}

/**
 * WeightBlock component
 * Wrapped with React.memo to prevent unnecessary re-renders
 */
export const WeightBlock = memo(function WeightBlock({ date, className }: WeightBlockProps) {
    const [inputValue, setInputValue] = useState('')
    const [isEditing, setIsEditing] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [validationError, setValidationError] = useState<string | null>(null)
    const [targetWeight, setTargetWeight] = useState<number | null>(null)

    // Get data from store
    const { dailyData, updateMetric } = useDashboardStore()
    const dateStr = formatLocalDate(date)
    const dayData = dailyData[dateStr]

    // Fetch target weight from profile settings
    useEffect(() => {
        getProfile()
            .then((profile) => {
                if (profile.settings?.target_weight != null) {
                    setTargetWeight(profile.settings.target_weight)
                }
            })
            .catch(() => {})
    }, [])

    // Get current and previous weight
    const currentWeight = dayData?.weight
    const isWeightLogged = currentWeight !== null && currentWeight !== undefined

    // Get previous day's weight for comparison - memoized
    const previousWeight = useMemo(() => {
        const previousDate = new Date(date)
        previousDate.setDate(date.getDate() - 1)
        const previousDateStr = formatLocalDate(previousDate)
        return dailyData[previousDateStr]?.weight
    }, [date, dailyData])

    // Calculate weight change
    const weightChange = currentWeight && previousWeight
        ? currentWeight - previousWeight
        : null

    // Calculate distance to target
    const distanceToTarget = currentWeight != null && targetWeight != null
        ? currentWeight - targetWeight
        : null

    // Format weight display
    // Показ — по-русски («67,4»), поле ввода — числом с точкой, как его разбирают.
    const formatWeightInput = (weight: number) => (weight % 1 === 0 ? weight.toString() : weight.toFixed(1))
    const formatWeight = (weight: number) => {
        return formatDecimal(weight)
    }

    // Debounced validation function (300ms delay)
    const debouncedValidate = useDebouncedCallback((value: string) => {
        if (value.trim() === '') {
            setValidationError(null)
            return
        }

        const numericValue = parseFloat(value)
        const validation = validateWeight(numericValue)

        if (!validation.isValid) {
            setValidationError(validation.error || t('common.invalidValue'))
        } else {
            setValidationError(null)
        }
    }, 300)

    // Handle input change with debounced validation
    const handleInputChange = useCallback((value: string) => {
        setInputValue(value)
        // Clear error immediately for better UX, then validate after debounce
        if (validationError) {
            setValidationError(null)
        }
        debouncedValidate(value)
    }, [debouncedValidate, validationError])

    // Handle save weight
    const handleSave = useCallback(async () => {
        if (!inputValue.trim()) {
            setValidationError(t('dashboard.weight.required'))
            return
        }

        const numericValue = parseFloat(inputValue)
        const validation = validateWeight(numericValue)

        if (!validation.isValid) {
            setValidationError(validation.error || t('common.invalidValue'))
            return
        }

        setIsSaving(true)
        setValidationError(null)

        try {
            await updateMetric(dateStr, {
                type: 'weight',
                data: { weight: numericValue }
            })

            setInputValue('')
            setIsEditing(false)
            toast.success(t('dashboard.weight.saved'))
        } catch (error) {
            console.error('Failed to save weight:', error)
            setValidationError(t('dashboard.weight.saveFailed'))
        } finally {
            setIsSaving(false)
        }
    }, [inputValue, dateStr, updateMetric])

    // Handle quick add button
    const handleQuickAdd = useCallback(() => {
        if (isWeightLogged) {
            // If weight is already logged, allow editing
            setInputValue(formatWeightInput(currentWeight))
            setIsEditing(true)
        } else {
            // If no weight logged, start editing
            setIsEditing(true)
        }
    }, [isWeightLogged, currentWeight])

    // Handle cancel editing
    const handleCancel = useCallback(() => {
        setInputValue('')
        setIsEditing(false)
        setValidationError(null)
    }, [])

    // Handle key press
    const handleKeyPress = useCallback((event: React.KeyboardEvent) => {
        if (event.key === 'Enter') {
            handleSave()
        } else if (event.key === 'Escape') {
            handleCancel()
        }
    }, [handleSave, handleCancel])

    // Check if this is today and weight is not logged
    const isToday = dateStr === formatLocalDate(new Date())
    const showAttentionIndicator = isToday && !isWeightLogged

    return (
        <Card className={cn('flex h-full flex-col gap-4', className)}>
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <CardTitle>{t('dashboard.weight.title')}</CardTitle>
                    {showAttentionIndicator && (
                        <AttentionBadge
                            urgency="normal"
                            ariaLabel={t('dashboard.weight.noneToday')}
                        />
                    )}
                </div>
                <IconButton
                    variant="ghost"
                    onClick={handleQuickAdd}
                    aria-label={isWeightLogged ? t('dashboard.weight.change') : t('dashboard.weight.add')}
                >
                    {isWeightLogged
                        ? <Pencil className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
                        : <Plus className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />}
                </IconButton>
            </div>

            {isEditing ? (
                <div className="space-y-3">
                    <div>
                        <label htmlFor="weight-input" className="sr-only">
                            {t('dashboard.weight.kilograms')}
                        </label>
                        <Input
                            id="weight-input"
                            type="number"
                            inputMode="decimal"
                            step="0.1"
                            min="0.1"
                            max="500"
                            placeholder={t('dashboard.weight.placeholder')}
                            value={inputValue}
                            onChange={(e) => handleInputChange(e.target.value)}
                            onKeyDown={handleKeyPress}
                            error={validationError || undefined}
                            autoFocus
                            aria-label={t('dashboard.weight.kilograms')}
                            aria-describedby={validationError ? "weight-error" : undefined}
                            aria-invalid={!!validationError}
                        />
                        {validationError && (
                            <div
                                id="weight-error"
                                className="sr-only"
                                role="alert"
                                aria-live="polite"
                            >
                                {validationError}
                            </div>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <Button
                            variant="secondary"
                            onClick={handleCancel}
                            disabled={isSaving}
                            aria-label={t('dashboard.weight.cancelAria')}
                        >
                            {t('common.cancel')}
                        </Button>
                        <Button
                            variant="primary"
                            onClick={handleSave}
                            isLoading={isSaving}
                            disabled={!!validationError || !inputValue.trim()}
                            className="flex-1"
                            aria-label={t('dashboard.weight.saveAria')}
                        >
                            {t('common.save')}
                        </Button>
                    </div>
                </div>
            ) : isWeightLogged ? (
                <div className="space-y-2" role="region" aria-label={t('dashboard.weight.currentAria')}>
                    <div className="flex items-baseline gap-1">
                        <span className="type-num-xl text-fg" aria-label={t('dashboard.weight.currentValueAria', { weight: formatWeight(currentWeight) })}>
                            {formatWeight(currentWeight)}
                        </span>
                        <span className="text-base text-fg-muted" aria-hidden="true">{t('dashboard.weight.kg')}</span>
                    </div>

                    <div
                        className="flex items-center gap-1.5 text-success-fg"
                        role="status"
                        aria-label={t('dashboard.weight.loggedAria')}
                    >
                        <Check className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                        <span className="text-sm font-medium">{t('dashboard.weight.logged')}</span>
                    </div>

                    {/* Изменение с вчера — без оценки цветом */}
                    {weightChange !== null && (
                        <div
                            className="flex items-center gap-1 text-sm text-fg tabular-nums"
                            role="status"
                            aria-label={t('dashboard.weight.changeAria', { direction: weightChange > 0 ? t('dashboard.weight.increase') : weightChange < 0 ? t('dashboard.weight.decrease') : t('dashboard.weight.unchanged'), amount: formatDecimal(Math.abs(weightChange)) })}
                        >
                            {weightChange > 0 ? (
                                <TrendingUp className="h-4 w-4 text-fg-muted" strokeWidth={1.8} aria-hidden="true" />
                            ) : weightChange < 0 ? (
                                <TrendingDown className="h-4 w-4 text-fg-muted" strokeWidth={1.8} aria-hidden="true" />
                            ) : (
                                <Minus className="h-4 w-4 text-fg-muted" strokeWidth={1.8} aria-hidden="true" />
                            )}
                            <span>
                                {weightChange > 0 ? '+' : ''}
                                {formatWeight(Math.abs(weightChange))} {t('dashboard.weight.kg')}
                            </span>
                            {weightChange !== 0 && (
                                <span className="text-fg-muted">
                                    {t('dashboard.weight.sinceYesterday')}
                                </span>
                            )}
                        </div>
                    )}

                    {previousWeight && (
                        <div className="text-sm text-fg-muted tabular-nums" aria-label={t('dashboard.weight.yesterdayAria', { weight: formatWeight(previousWeight) })}>
                            {t('dashboard.weight.yesterday', { weight: formatWeight(previousWeight) })}
                        </div>
                    )}

                    {/* Цель и расстояние до неё — числом, без перекраски */}
                    {targetWeight != null && distanceToTarget != null && (
                        <div className="flex items-center gap-1.5 text-sm text-fg-muted tabular-nums">
                            <Target className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                            <span>{t('dashboard.weight.target', { weight: formatWeight(targetWeight) })}</span>
                            {Math.abs(distanceToTarget) >= 0.1 ? (
                                <span className="text-fg">
                                    ({distanceToTarget > 0 ? '-' : '+'}{formatWeight(Math.abs(distanceToTarget))} {t('dashboard.weight.kg')})
                                </span>
                            ) : (
                                <span className="font-medium text-success-fg">{t('dashboard.weight.targetReached')}</span>
                            )}
                        </div>
                    )}
                </div>
            ) : (
                <div className="space-y-3" role="status" aria-label={t('dashboard.weight.emptyAria')}>
                    <p className="text-sm text-fg-muted">
                        {t('dashboard.weight.empty')}
                    </p>
                    {previousWeight && (
                        <p className="text-sm text-fg-muted tabular-nums" aria-label={t('dashboard.weight.yesterdayAria', { weight: formatWeight(previousWeight) })}>
                            {t('dashboard.weight.yesterday', { weight: formatWeight(previousWeight) })}
                        </p>
                    )}
                    {targetWeight != null && (
                        <div className="flex items-center gap-1.5 text-sm text-fg-muted tabular-nums">
                            <Target className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                            <span>{t('dashboard.weight.target', { weight: formatWeight(targetWeight) })}</span>
                        </div>
                    )}
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleQuickAdd}
                        aria-label={t('dashboard.weight.logAria')}
                    >
                        <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                        {t('dashboard.weight.log')}
                    </Button>
                </div>
            )}

            {!isEditing && (
                <p className="mt-auto type-caption text-fg-subtle">
                    {t('dashboard.weight.hint')}
                </p>
            )}
        </Card>
    )
})
