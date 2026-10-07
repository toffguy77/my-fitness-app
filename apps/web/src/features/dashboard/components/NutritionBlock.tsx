/**
 * NutritionBlock — питание дня на дашборде.
 *
 * Дизайн-система «Коуч + Ясность» (docs/design-system): полукруглая шкала
 * калорий с остатком крупной цифрой, под ней остаток по каждому макросу в
 * граммах и запись еды в одно касание — поиск, фото или штрихкод сразу, без
 * захода в дневник.
 *
 * Без нормы доля от неё не показывается: съеденное — числом, без шкалы и без
 * цветовой оценки, ниже приглашение норму посчитать.
 */

import { useState, useEffect, memo, useMemo } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Card, CardTitle } from '@/shared/components/ui/Card'
import { ProgressArc } from '@/shared/components/ui/ProgressArc'
import { MacroRemaining } from '@/shared/components/ui/MacroRemaining'
import { QuickAddActions, type QuickAddMethod } from '@/shared/components/ui/QuickAdd'
import { cn } from '@/shared/utils/cn'
import { useDashboardStore } from '../store/dashboardStore'
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
                {Math.round(value)}{t('units.gram')}
            </span>
        </div>
    )
})

export const NutritionBlock = memo(function NutritionBlock({ date, className }: NutritionBlockProps) {
    const router = useRouter()
    const [isNavigating, setIsNavigating] = useState(false)
    const [calcTargets, setCalcTargets] = useState<CalculatedTargets | null>(null)
    const [missingTargetInputs, setMissingTargetInputs] = useState<MissingTargetInputs | null>(null)

    const { dailyData, weeklyPlan, targetsVersion } = useDashboardStore()
    const dateStr = formatLocalDate(date)
    const dayData = dailyData[dateStr]

    // Норма на выбранный день; перезапрашивается, когда targetsVersion меняется
    // после сохранения метрики, от которой она зависит.
    useEffect(() => {
        getTargets(dateStr)
            .then((answer) => {
                setCalcTargets(answer.targets)
                setMissingTargetInputs(answer.missing)
            })
            .catch(() => {})
    }, [dateStr, targetsVersion])

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

    // Калории показываются целыми: норма считается по формуле, записи —
    // по граммам, и без округления на экран выходило «1923.3000000000002».
    // Остаток считается от уже округлённых чисел, чтобы «осталось» и
    // «съедено N из M» складывались на глаз.
    const eatenKcal = Math.round(nutrition.calories)
    const goalKcal = goals ? Math.round(goals.caloriesGoal) : 0
    const isOverCalorieGoal = goals ? eatenKcal > goalKcal : false
    const caloriesLeft = goals ? goalKcal - eatenKcal : 0
    const hasMacroGoals = !!(goals?.proteinGoal && goals.fatGoal && goals.carbsGoal)

    // Запись сразу нужным способом: дневник открывает окно записи на вкладке
    // из ?add= (FoodTrackerPage, LINKABLE_ENTRY_TABS).
    const handleQuickAdd = (method: QuickAddMethod) => {
        // Переход внутри приложения, без перезагрузки страницы: дневник
        // открывается сразу, а кнопки на это время недоступны — второе
        // нажатие не запустит второй переход.
        setIsNavigating(true)
        router.push(`/food-tracker?date=${dateStr}&add=${method}`)
    }

    const isToday = dateStr === formatLocalDate(new Date())
    const showAttentionIndicator = isToday && nutrition.calories === 0

    return (
        <Card className={cn('flex h-full flex-col gap-4', className)} data-testid="nutrition-block">
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <CardTitle className="type-title-2">{t('dashboard.nutrition.title')}</CardTitle>
                    {showAttentionIndicator && (
                        <AttentionBadge urgency="normal" ariaLabel={t('dashboard.nutrition.noneToday')} />
                    )}
                </div>
                <a
                    href={`/food-tracker?date=${dateStr}`}
                    aria-label={t('dashboard.nutrition.diaryAria')}
                    className="flex min-h-11 items-center text-[15px] font-semibold text-primary hover:underline"
                >
                    {t('dashboard.nutrition.diary')}
                </a>
            </div>

            {goals ? (
                <ProgressArc
                    value={eatenKcal}
                    max={goalKcal}
                    label={isOverCalorieGoal
                        ? t('dashboard.nutrition.arcOverAria', { eaten: eatenKcal, goal: goalKcal, over: -caloriesLeft })
                        : t('dashboard.nutrition.arcAria', { eaten: eatenKcal, goal: goalKcal, left: caloriesLeft })}
                >
                    <span className="type-num-xl text-fg" data-testid="calorie-remaining">
                        {isOverCalorieGoal ? `+${-caloriesLeft}` : caloriesLeft}
                    </span>
                    <span className="text-sm text-fg-muted">
                        {isOverCalorieGoal ? t('dashboard.nutrition.overBy') : t('dashboard.nutrition.remaining')}
                        {' · '}
                        {t('dashboard.nutrition.eatenWord')}{' '}
                        <span data-testid="calorie-value" className="tabular-nums">{eatenKcal}</span>{' '}
                        {t('dashboard.nutrition.ofGoal', { goal: goalKcal })}
                    </span>
                </ProgressArc>
            ) : (
                <div className="space-y-2">
                    <div className="text-center">
                        <div
                            className="type-num-xl text-fg"
                            data-testid="calorie-value"
                            aria-label={t('foodTracker.noTarget.eatenAria', { calories: eatenKcal })}
                        >
                            {eatenKcal}
                        </div>
                        <div className="text-sm text-fg-muted">{t('macros.calories')}</div>
                    </div>

                    {/* Съеденное по нутриентам — цветом, но без доли от нормы.
                        Цвет здесь опознаёт нутриент и ничего не утверждает о
                        выполнении нормы, которой нет; шкала и остаток
                        показывали бы именно долю, и поэтому отсутствуют. */}
                    <div className="flex items-center justify-center gap-3" data-testid="macros-without-target">
                        <MacroAmount label={t('macros.proteinShort')} value={nutrition.protein} color={MACRO_COLORS.protein} />
                        <MacroAmount label={t('macros.fatShort')} value={nutrition.fat} color={MACRO_COLORS.fat} />
                        <MacroAmount label={t('macros.carbsShort')} value={nutrition.carbs} color={MACRO_COLORS.carbs} />
                    </div>
                </div>
            )}

            {!goals && <CalculateTargetPrompt missing={missingTargetInputs} />}

            {isOverCalorieGoal && (
                <div
                    className="flex items-center gap-2 rounded-tile bg-warning-soft p-3"
                    role="alert"
                    aria-live="polite"
                >
                    <AlertTriangle className="h-4 w-4 flex-shrink-0 text-warning-fg" aria-hidden="true" />
                    <p className="text-sm text-warning-fg">{t('dashboard.nutrition.overGoal')}</p>
                </div>
            )}

            {goals && hasMacroGoals && (
                <MacroRemaining
                    className="border-t border-line pt-4"
                    eaten={{ protein: nutrition.protein, fat: nutrition.fat, carbs: nutrition.carbs }}
                    goal={{ protein: goals.proteinGoal!, fat: goals.fatGoal!, carbs: goals.carbsGoal! }}
                />
            )}

            <QuickAddActions onSelect={handleQuickAdd} pending={isNavigating} className="mt-auto" />
        </Card>
    )
})
