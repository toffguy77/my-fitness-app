'use client';

/**
 * KBZHUSummary — итог дня в дневнике питания.
 *
 * Дизайн-система «Коуч + Ясность»: фраза «Съедено N из M ккал» засечками,
 * под ней полоса калорий и три плитки с остатком по каждому макросу в
 * граммах. Сколько ещё можно — главное число; «съедено из нормы» — подпись.
 *
 * Без нормы доли нет: съеденное числом, без полос (нормы не существует, и
 * показать долю от неё можно только выдумав её).
 *
 * @module food-tracker/components/KBZHUSummary
 */

import type { KBZHU } from '../types';
import { MacroRemaining } from '@/shared/components/ui/MacroRemaining';
import { ProgressBar } from '@/shared/components/ui/ProgressBar';
import { t } from '@/shared/i18n';
import { color } from '@burcev/design-tokens';

export interface KBZHUSummaryProps {
    /** Съедено за день. */
    current: KBZHU;
    /** Норма; отдельные значения или вся норма могут отсутствовать. */
    target: Partial<KBZHU> | null;
    /** Additional CSS classes */
    className?: string;
    /** Откуда норма. */
    source?: 'calculated' | 'curator_override' | null;
    /** Калории, добавленные к норме за тренировку. */
    workoutBonus?: number | null;
}

// Калории — не нутриент, и опознавать их цветом нутриента нечем: это сумма
// остальных. Их цвет — бренд (color.primary), постоянный при любой доле от
// нормы: он обозначает «энергию дня», а не оценку. Раньше здесь стоял
// `bg-yellow-500`, и он читался как оценка, хотя ничего не оценивал.
export const CALORIES_COLOR = color.primary;

export function KBZHUSummary({
    current,
    target,
    className = '',
    source,
    workoutBonus,
}: KBZHUSummaryProps) {
    const eaten = Math.round(current.calories);
    const goal = target?.calories && target.calories > 0 ? Math.round(target.calories) : null;
    const over = goal !== null && eaten > goal;

    return (
        <section className={`flex flex-col gap-2.5 ${className}`} aria-label={t('foodTracker.summary.aria')}>
            <h2 className="sr-only">{t('foodTracker.summary.dailyTarget')}</h2>

            <p className="type-title-3 text-fg" data-testid="kbzhu-calories">
                {t('foodTracker.summary.eatenLead')}{' '}
                <strong className="font-semibold tabular-nums">{eaten}</strong>
                {goal !== null ? <> {t('foodTracker.summary.ofCalories', { goal })}</> : <> {t('foodTracker.summary.caloriesUnit')}</>}
            </p>

            {goal !== null && (
                <ProgressBar
                    value={eaten}
                    max={goal}
                    color={CALORIES_COLOR}
                    thickness={8}
                    label={t('foodTracker.summary.caloriesAria', { eaten, goal })}
                />
            )}

            {over && (
                <p className="text-sm font-medium text-warning-fg" role="status">
                    {t('foodTracker.summary.overBy', { over: eaten - goal! })}
                </p>
            )}

            <MacroRemaining
                variant="tiles"
                className="pt-1"
                eaten={{ protein: current.protein, fat: current.fat, carbs: current.carbs }}
                goal={{ protein: target?.protein, fat: target?.fat, carbs: target?.carbs }}
            />

            {source && (
                <p className="text-xs text-fg-subtle">
                    {source === 'calculated' ? t('foodTracker.summary.calculated') : t('foodTracker.summary.curatorPlan')}
                    {workoutBonus ? t('foodTracker.summary.workoutBonus', { calories: Math.round(workoutBonus) }) : ''}
                </p>
            )}
        </section>
    );
}
