/**
 * StepsBlock component for daily steps tracking
 *
 * Плитка дашборда в языке карточки питания: заголовок засечками, шаги —
 * главным числом, полоса нормы чернилами (цвет опознаёт показатель и не
 * меняется при достижении цели — о нём говорит строка «Цель достигнута»),
 * остаток до цели подписью. Процент на экран не выводится.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.6, 4.7
 *
 * Performance optimizations:
 * - React.memo to prevent unnecessary re-renders
 * - Debounced input validation (300ms)
 */

import { useState, useCallback, memo, useMemo } from 'react'
import { Plus, Check } from 'lucide-react'
import { color } from '@burcev/design-tokens'
import { Card, CardTitle } from '@/shared/components/ui/Card'
import { Button, IconButton } from '@/shared/components/ui/Button'
import { Input } from '@/shared/components/ui/Input'
import { ProgressBar } from '@/shared/components/ui/ProgressBar'
import { cn } from '@/shared/utils/cn'
import { formatLocalDate } from '@/shared/utils/format'
import { useDashboardStore } from '../store/dashboardStore'
import { validateSteps } from '../utils/validation'
import { calculatePercentage } from '../utils/calculations'
import { useDebouncedCallback } from '@/shared/hooks/useDebounce'
import { AttentionBadge } from './AttentionBadge'
import toast from 'react-hot-toast'
import { t } from '@/shared/i18n'

/**
 * Props for StepsBlock component
 */
export interface StepsBlockProps {
    date: Date
    className?: string
}

/**
 * StepsBlock component
 * Wrapped with React.memo to prevent unnecessary re-renders
 */
export const StepsBlock = memo(function StepsBlock({ date, className }: StepsBlockProps) {
    const [inputValue, setInputValue] = useState('')
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [validationError, setValidationError] = useState<string | null>(null)

    // Get data from store
    const { dailyData, weeklyPlan, updateMetric } = useDashboardStore()
    const dateStr = formatLocalDate(date)
    const dayData = dailyData[dateStr]

    // Get current steps and goal
    const currentSteps = dayData?.steps || 0
    const stepsGoal = weeklyPlan?.stepsGoal || 10000

    // Calculate percentage and completion - memoized
    const { percentage, isGoalReached } = useMemo(() => ({
        percentage: calculatePercentage(currentSteps, stepsGoal),
        isGoalReached: currentSteps >= stepsGoal,
    }), [currentSteps, stepsGoal])

    // Format steps display
    const formatSteps = (steps: number) => {
        if (steps >= 1000) {
            return `${(steps / 1000).toFixed(1)}k`
        }
        return steps.toString()
    }

    // Debounced validation function (300ms delay)
    const debouncedValidate = useDebouncedCallback((value: string) => {
        if (value.trim() === '') {
            setValidationError(null)
            return
        }

        const numericValue = parseInt(value, 10)
        const validation = validateSteps(numericValue)

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

    // Handle save steps
    const handleSave = useCallback(async () => {
        if (!inputValue.trim()) {
            setValidationError(t('dashboard.steps.required'))
            return
        }

        const numericValue = parseInt(inputValue, 10)
        const validation = validateSteps(numericValue)

        if (!validation.isValid) {
            setValidationError(validation.error || t('common.invalidValue'))
            return
        }

        setIsSaving(true)
        setValidationError(null)

        try {
            await updateMetric(dateStr, {
                type: 'steps',
                data: { steps: numericValue }
            })

            setInputValue('')
            setIsDialogOpen(false)
            toast.success(t('dashboard.steps.saved'))
        } catch (error) {
            console.error('Failed to save steps:', error)
            setValidationError(t('dashboard.steps.saveFailed'))
        } finally {
            setIsSaving(false)
        }
    }, [inputValue, dateStr, updateMetric])

    // Handle quick add button
    const handleQuickAdd = useCallback(() => {
        setInputValue(currentSteps.toString())
        setIsDialogOpen(true)
    }, [currentSteps])

    // Handle cancel dialog
    const handleCancel = useCallback(() => {
        setInputValue('')
        setIsDialogOpen(false)
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

    // Check if this is today and steps are not logged
    const isToday = dateStr === formatLocalDate(new Date())
    const showAttentionIndicator = isToday && currentSteps === 0

    return (
        <Card className={cn('flex h-full flex-col gap-4', className)}>
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <CardTitle>{t('dashboard.steps.title')}</CardTitle>
                    {showAttentionIndicator && (
                        <AttentionBadge
                            urgency="normal"
                            ariaLabel={t('dashboard.steps.noneToday')}
                        />
                    )}
                </div>
                <IconButton
                    variant="ghost"
                    onClick={handleQuickAdd}
                    aria-label={t('dashboard.steps.add')}
                >
                    <Plus className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
                </IconButton>
            </div>

            {/* Шаги — главным числом, норма — подписью, полоса — чернилами */}
            <div className="space-y-2" role="region" aria-label={t('dashboard.steps.progressRegion')}>
                <div className="flex items-baseline gap-2">
                    <span
                        className="type-num-l text-fg"
                        aria-label={t('dashboard.steps.currentAria', { steps: currentSteps.toLocaleString() })}
                    >
                        {formatSteps(currentSteps)}
                    </span>
                    <span
                        className="text-sm text-fg-muted tabular-nums"
                        aria-label={t('dashboard.steps.goalAria', { steps: stepsGoal.toLocaleString() })}
                    >
                        {t('dashboard.steps.ofGoal', { steps: formatSteps(stepsGoal) })}
                    </span>
                </div>
                <ProgressBar
                    value={Math.min(currentSteps, stepsGoal)}
                    max={stepsGoal}
                    color={color.fg}
                    label={t('dashboard.steps.progressAria', { percentage: percentage.toFixed(1) })}
                />

                {/* Цель достигнута — состояние успеха словом и знаком */}
                {isGoalReached && (
                    <div
                        className="flex items-center gap-1.5 text-success-fg"
                        role="status"
                        aria-label={t('dashboard.steps.goalReachedAria')}
                    >
                        <Check className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                        <span className="text-sm font-medium">{t('dashboard.steps.goalReached')}</span>
                    </div>
                )}

                {currentSteps > 0 && !isGoalReached && (
                    <p
                        className="text-sm text-fg-muted tabular-nums"
                        aria-label={t('dashboard.steps.remainingAria', { steps: (stepsGoal - currentSteps).toLocaleString() })}
                    >
                        {t('dashboard.steps.remaining', { steps: (stepsGoal - currentSteps).toLocaleString() })}
                    </p>
                )}
            </div>

            {/* Ввод шагов */}
            {isDialogOpen && (
                <div className="space-y-3 rounded-tile border border-line bg-canvas p-3" role="dialog" aria-labelledby="steps-dialog-title">
                    <div id="steps-dialog-title" className="type-headline text-fg">
                        {t('dashboard.steps.update')}
                    </div>

                    <div>
                        <label htmlFor="steps-input" className="sr-only">
                            {t('dashboard.steps.count')}
                        </label>
                        <Input
                            id="steps-input"
                            type="number"
                            inputMode="numeric"
                            min="0"
                            max="100000"
                            placeholder={t('dashboard.steps.placeholder')}
                            value={inputValue}
                            onChange={(e) => handleInputChange(e.target.value)}
                            onKeyDown={handleKeyPress}
                            error={validationError || undefined}
                            autoFocus
                            aria-label={t('dashboard.steps.count')}
                            aria-describedby={validationError ? "steps-error" : undefined}
                            aria-invalid={!!validationError}
                        />
                        {validationError && (
                            <div
                                id="steps-error"
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
                            aria-label={t('dashboard.steps.cancelAria')}
                        >
                            {t('common.cancel')}
                        </Button>
                        <Button
                            variant="primary"
                            onClick={handleSave}
                            isLoading={isSaving}
                            disabled={!!validationError || !inputValue.trim()}
                            className="flex-1"
                            aria-label={t('dashboard.steps.saveAria')}
                        >
                            {t('common.save')}
                        </Button>
                    </div>
                </div>
            )}

            {/* Пустое состояние */}
            {currentSteps === 0 && !isDialogOpen && (
                <div className="flex items-center justify-between gap-2" role="status" aria-label={t('dashboard.steps.emptyAria')}>
                    <p className="text-sm text-fg-muted">{t('dashboard.steps.empty')}</p>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleQuickAdd}
                        aria-label={t('dashboard.steps.add')}
                    >
                        <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                        {t('common.add')}
                    </Button>
                </div>
            )}

            <p className="mt-auto type-caption text-fg-subtle">
                {t('dashboard.steps.hint')}
            </p>
        </Card>
    )
})
