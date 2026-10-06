/**
 * NutritionBlock component for daily nutrition tracking
 *
 * Compact segmented ring design showing calorie progress in center
 * with color-coded macro segments (protein, fat, carbs).
 *
 * Requirements: 2.1, 2.2, 2.4, 2.5, 2.6
 *
 * Performance optimizations:
 * - React.memo to prevent unnecessary re-renders
 * - Memoized sub-components (SegmentedRing, MacroProgressBar)
 */

import { useState, useEffect, memo, useMemo } from 'react'
import { Plus, AlertTriangle, UtensilsCrossed } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/Card'
import { Button } from '@/shared/components/ui/Button'
import { cn } from '@/shared/utils/cn'
import { useDashboardStore } from '../store/dashboardStore'
import { calculatePercentage } from '../utils/calculations'
import { formatLocalDate } from '@/shared/utils/format'
import { AttentionBadge } from './AttentionBadge'
import { getTargets } from '@/features/nutrition-calc/api/nutritionCalc'
import { CalculateTargetPrompt } from '@/features/nutrition-calc/components/CalculateTargetPrompt'
import type { MissingTargetInputs } from '@/features/nutrition-calc/types'
import type { CalculatedTargets } from '@/features/nutrition-calc/types'
import { t } from '@/shared/i18n'
import { MACRO_COLORS } from '@/shared/constants/macros'

/**
 * Props for NutritionBlock component
 */
export interface NutritionBlockProps {
    date: Date
    className?: string
}

/**
 * Segment data for the ring
 */
interface Segment {
    percentage: number
    color: string
    label: string
}

/**
 * Props for segmented ring indicator
 */
interface SegmentedRingProps {
    size?: number
    strokeWidth?: number
    segments: Segment[]
    className?: string
    children?: React.ReactNode
}

/**
 * Segmented ring progress indicator
 * Three colored arcs for protein/fat/carbs, each filling proportionally
 * Memoized to prevent unnecessary re-renders
 */
const SegmentedRing = memo(function SegmentedRing({
    size = 72,
    strokeWidth = 6,
    segments,
    className,
    children,
}: SegmentedRingProps) {
    const radius = (size - strokeWidth) / 2
    const circumference = 2 * Math.PI * radius
    const gapLength = 4
    const segmentMax = (circumference - segments.length * gapLength) / segments.length

    return (
        <div
            className={cn('relative inline-flex items-center justify-center', className)}
            role="img"
            aria-label={t('dashboard.nutrition.macrosAria')}
        >
            <svg
                width={size}
                height={size}
                className="transform -rotate-90"
                aria-hidden="true"
            >
                {/* Background track */}
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke="currentColor"
                    strokeWidth={strokeWidth}
                    fill="none"
                    className="text-on-coach"
                />
                {/* Colored segments */}
                {segments.map((seg, i) => {
                    const startOffset = i * (segmentMax + gapLength)
                    const filledLength = Math.min(seg.percentage / 100, 1) * segmentMax
                    if (filledLength <= 0) return null
                    return (
                        <circle
                            key={seg.label}
                            cx={size / 2}
                            cy={size / 2}
                            r={radius}
                            stroke={seg.color}
                            strokeWidth={strokeWidth}
                            fill="none"
                            strokeLinecap="round"
                            strokeDasharray={`${filledLength} ${circumference - filledLength}`}
                            strokeDashoffset={-startOffset}
                            className="transition-all duration-500"
                        />
                    )
                })}
            </svg>
            {/* Center content */}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                {children}
            </div>
        </div>
    )
})

/**
 * Props for macro progress bar
 */
interface MacroProgressBarProps {
    label: string
    current: number
    goal: number
    unit?: string
    color: string
    className?: string
}

/**
 * Compact macro progress bar with colored dot indicator
 * Memoized to prevent unnecessary re-renders
 */
const MacroProgressBar = memo(function MacroProgressBar({
    label,
    current,
    goal,
    unit = t('units.gram'),
    color,
    className,
}: MacroProgressBarProps) {
    const percentage = calculatePercentage(current, goal)
    const isOverGoal = percentage > 100

    return (
        <div className={cn('space-y-1', className)}>
            <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-fg flex items-center gap-1.5">
                    <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: color }}
                        aria-hidden="true"
                    />
                    {label}
                </span>
                <span className={cn(
                    'font-semibold',
                    isOverGoal ? 'text-warning-fg' : 'text-fg'
                )}>
                    {current}{unit} / {goal}{unit}
                </span>
            </div>
            <div className="h-1.5 bg-subtle rounded-full overflow-hidden">
                {/* Заливка окрашена цветом своего нутриента, а не общим синим:
                    цвет опознаёт нутриент. Превышение нормы сообщается
                    выделением числа выше, а не перекрашиванием полосы — иначе
                    цвет работает двумя работами сразу и не читается ни одна. */}
                <div
                    className="h-full transition-all duration-300 rounded-full"
                    style={{ width: `${Math.min(percentage, 100)}%`, backgroundColor: color }}
                    role="progressbar"
                    aria-valuenow={current}
                    aria-valuemin={0}
                    aria-valuemax={goal}
                    aria-label={t('dashboard.nutrition.valueAria', { label, current, goal, unit })}
                />
            </div>
            <div className="text-xs text-fg-muted text-right">
                {percentage.toFixed(1)}%
            </div>
        </div>
    )
})

/**
 * Съеденное по одному нутриенту, когда нормы нет.
 *
 * Показывает количество и опознаёт нутриент цветом. Доли от нормы здесь нет
 * намеренно: нормы не существует, а показать долю от несуществующего можно
 * только выдумав её.
 */
const MacroAmount = memo(function MacroAmount({
    label,
    value,
    color,
}: {
    label: string
    value: number
    color: string
}) {
    return (
        <div className="flex items-center gap-1.5 text-xs">
            <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: color }}
                aria-hidden="true"
            />
            <span className="text-fg-muted">{label}</span>
            <span className="font-semibold text-fg">
                {value}{t('units.gram')}
            </span>
        </div>
    )
})

/**
 * NutritionBlock component
 * Wrapped with React.memo to prevent unnecessary re-renders when props haven't changed
 */
export const NutritionBlock = memo(function NutritionBlock({ date, className }: NutritionBlockProps) {
    const [isNavigating, setIsNavigating] = useState(false)
    const [calcTargets, setCalcTargets] = useState<CalculatedTargets | null>(null)
    const [missingTargetInputs, setMissingTargetInputs] = useState<MissingTargetInputs | null>(null)

    // Get data from store
    const { dailyData, weeklyPlan, targetsVersion } = useDashboardStore()
    const dateStr = formatLocalDate(date)
    const dayData = dailyData[dateStr]

    // Fetch calculated targets for the selected date
    // Re-fetch when targetsVersion changes (bumped after successful metric save)
    useEffect(() => {
        getTargets(dateStr)
            .then((answer) => {
                setCalcTargets(answer.targets)
                setMissingTargetInputs(answer.missing)
            })
            .catch(() => {})
    }, [dateStr, targetsVersion])

    // Get nutrition data and goals - memoized to prevent recalculation
    const nutrition = useMemo(() =>
        dayData?.nutrition || { calories: 0, protein: 0, fat: 0, carbs: 0 },
        [dayData?.nutrition]
    )

    /**
     * Норма дня — или её отсутствие.
     *
     * Запасных чисел здесь нет намеренно. Раньше стояло
     * `calcTargets?.calories || 2000`, и человеку с незаполненным профилем
     * показывали 2000 ккал как его норму — причём в трекере углеводов при том же
     * «по умолчанию» было 200, а здесь 250. Одна и та же норма на двух экранах
     * разная — доказательство, что её никто не считал.
     */
    const goals = useMemo(() => {
        const caloriesGoal = weeklyPlan?.caloriesGoal || calcTargets?.calories
        const proteinGoal = weeklyPlan?.proteinGoal || calcTargets?.protein
        const fatGoal = weeklyPlan?.fatGoal || calcTargets?.fat
        const carbsGoal = weeklyPlan?.carbsGoal || calcTargets?.carbs
        if (!caloriesGoal) return null
        return { caloriesGoal, proteinGoal, fatGoal, carbsGoal }
    }, [weeklyPlan?.caloriesGoal, weeklyPlan?.proteinGoal, weeklyPlan?.fatGoal, weeklyPlan?.carbsGoal, calcTargets])

    // Проценты и превышение имеют смысл только относительно нормы.
    const caloriesPercentage = goals ? calculatePercentage(nutrition.calories, goals.caloriesGoal) : 0
    const isOverCalorieGoal = goals ? nutrition.calories > goals.caloriesGoal : false

    // Ring segments for macros
    const segments = useMemo<Segment[]>(() => goals ? [
        { percentage: calculatePercentage(nutrition.protein, goals.proteinGoal ?? 0), color: MACRO_COLORS.protein, label: 'protein' },
        { percentage: calculatePercentage(nutrition.fat, goals.fatGoal ?? 0), color: MACRO_COLORS.fat, label: 'fat' },
        { percentage: calculatePercentage(nutrition.carbs, goals.carbsGoal ?? 0), color: MACRO_COLORS.carbs, label: 'carbs' },
    ] : [], [nutrition.protein, nutrition.fat, nutrition.carbs, goals])

    // Handle quick add navigation
    const handleQuickAdd = async () => {
        setIsNavigating(true)
        try {
            window.location.href = `/food-tracker?date=${dateStr}`
        } catch (error) {
            console.error('Navigation failed:', error)
        } finally {
            setIsNavigating(false)
        }
    }

    // Check if this is today and nutrition is not logged
    const isToday = dateStr === formatLocalDate(new Date())
    const showAttentionIndicator = isToday && nutrition.calories === 0

    return (
        <Card className={cn('h-full', className)} variant="bordered">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <CardTitle className="text-lg font-semibold text-fg">
                            {t('dashboard.nutrition.title')}
                        </CardTitle>
                        {showAttentionIndicator && (
                            <AttentionBadge
                                urgency="normal"
                                ariaLabel={t('dashboard.nutrition.noneToday')}
                            />
                        )}
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleQuickAdd}
                        isLoading={isNavigating}
                        className="h-8 w-8 p-0"
                        aria-label={t('dashboard.nutrition.addFood')}
                    >
                        <Plus className="h-4 w-4" />
                    </Button>
                </div>
            </CardHeader>

            <CardContent className="space-y-3">
                {/* Без нормы не показывается доля от неё: съеденное — числом,
                    без процента, без кольца и без цветовой оценки. Ниже стоит
                    приглашение норму посчитать. */}
                {goals ? (
                    <div className="flex justify-center">
                        <SegmentedRing
                            size={72}
                            strokeWidth={6}
                            segments={segments}
                        >
                            <div className="text-center">
                                {/* Калории без цветовой оценки доли от нормы: она
                                    сообщается процентом ниже и пометкой о
                                    превышении. */}
                                <div className="text-base font-bold text-fg" data-testid="calorie-value">
                                    {nutrition.calories}
                                </div>
                                <div className="text-xs text-fg-muted leading-tight">
                                    {t('dashboard.nutrition.ofCalories', { calories: goals.caloriesGoal })}
                                </div>
                                <div className={cn(
                                    'text-xs font-medium',
                                    isOverCalorieGoal ? 'text-warning-fg' : 'text-fg-muted'
                                )}>
                                    {caloriesPercentage.toFixed(1)}%
                                </div>
                            </div>
                        </SegmentedRing>
                    </div>
                ) : (
                    <div className="space-y-2">
                        <div className="text-center">
                            <div
                                className="text-base font-bold text-fg"
                                data-testid="calorie-value"
                                aria-label={t('foodTracker.noTarget.eatenAria', { calories: nutrition.calories })}
                            >
                                {nutrition.calories}
                            </div>
                            <div className="text-xs text-fg-muted">{t('macros.calories')}</div>
                        </div>

                        {/* Съеденное по нутриентам — цветом, но без доли от нормы.
                            Цвет здесь опознаёт нутриент и ничего не утверждает о
                            выполнении нормы, которой нет; кольцо и проценты
                            показывали бы именно долю, и поэтому отсутствуют. */}
                        <div className="flex items-center justify-center gap-3" data-testid="macros-without-target">
                            <MacroAmount label={t('macros.proteinShort')} value={nutrition.protein} color={MACRO_COLORS.protein} />
                            <MacroAmount label={t('macros.fatShort')} value={nutrition.fat} color={MACRO_COLORS.fat} />
                            <MacroAmount label={t('macros.carbsShort')} value={nutrition.carbs} color={MACRO_COLORS.carbs} />
                        </div>
                    </div>
                )}

                {!goals && <CalculateTargetPrompt missing={missingTargetInputs} />}

                {/* Warning when goal exceeded */}
                {isOverCalorieGoal && (
                    <div
                        className="flex items-center gap-2 p-2 bg-warning-soft border border-warning/30 rounded-lg"
                        role="alert"
                        aria-live="polite"
                    >
                        <AlertTriangle className="h-3.5 w-3.5 text-warning-fg flex-shrink-0" aria-hidden="true" />
                        <p className="text-xs text-warning-fg">
                            {t('dashboard.nutrition.overGoal')}
                        </p>
                    </div>
                )}

                {/* Macro breakdown - compact. Полосы прогресса требуют нормы. */}
                {goals && (
                    <div className="space-y-2">
                        <MacroProgressBar
                            label={t('macros.protein')}
                            current={nutrition.protein}
                            goal={goals.proteinGoal ?? 0}
                            unit={t('units.gram')}
                            color={MACRO_COLORS.protein}
                        />

                        <MacroProgressBar
                            label={t('macros.fat')}
                            current={nutrition.fat}
                            goal={goals.fatGoal ?? 0}
                            unit={t('units.gram')}
                            color={MACRO_COLORS.fat}
                        />

                        <MacroProgressBar
                            label={t('macros.carbs')}
                            current={nutrition.carbs}
                            goal={goals.carbsGoal ?? 0}
                            unit={t('units.gram')}
                            color={MACRO_COLORS.carbs}
                        />
                    </div>
                )}

                {/* Empty state */}
                {nutrition.calories === 0 && (
                    <div className="text-center py-2 space-y-2">
                        <UtensilsCrossed className="h-8 w-8 mx-auto text-fg-subtle" aria-hidden="true" />
                        <p className="text-sm text-fg-muted">{t('dashboard.nutrition.empty')}</p>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleQuickAdd}
                            isLoading={isNavigating}
                            className="text-primary border-primary/30 hover:bg-primary-soft"
                            aria-label={t('dashboard.nutrition.addToDiaryAria')}
                        >
                            <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
                            {t('dashboard.nutrition.add')}
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    )
})
