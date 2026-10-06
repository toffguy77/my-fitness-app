import { cn } from '@/shared/utils/cn'
import { MACRO_COLORS, MACRO_KEYS, MACRO_TEXT_COLORS, type MacroKey } from '@/shared/constants/macros'
import { t } from '@/shared/i18n'
import { ProgressBar } from './ProgressBar'

export type MacroAmounts = Record<MacroKey, number>

export interface MacroRemainingProps {
    eaten: MacroAmounts
    goal: MacroAmounts
    /**
     * `plain` — колонки без подложки (внутри карточки дашборда);
     * `tiles` — каждая колонка своей плиткой (сводка дневника на фоне экрана).
     */
    variant?: 'plain' | 'tiles'
    className?: string
}

const LABELS: Record<MacroKey, () => string> = {
    protein: () => t('macros.protein'),
    fat: () => t('macros.fat'),
    carbs: () => t('macros.carbs'),
}

/**
 * Остаток по каждому макросу в граммах — главное число, «съедено из нормы» —
 * подпись. Человеку за едой нужен ответ «сколько ещё можно», а не доля.
 *
 * Сверх нормы остаток не уходит в минус: показывается «сверх нормы» и число
 * превышения, цвет нутриента не меняется (openspec macro-colour-system).
 */
export function MacroRemaining({ eaten, goal, variant = 'plain', className }: MacroRemainingProps) {
    return (
        <div className={cn('grid grid-cols-3', variant === 'tiles' ? 'gap-2' : 'gap-4', className)}>
            {MACRO_KEYS.map((key) => {
                const label = LABELS[key]()
                const e = Math.round(eaten[key])
                const g = Math.round(goal[key])
                const left = g - e
                const over = left < 0
                const aria = over
                    ? t('ui.macroRemaining.overAria', { label, over: -left, eaten: e, goal: g })
                    : t('ui.macroRemaining.aria', { label, left, eaten: e, goal: g })
                return (
                    <div
                        key={key}
                        data-testid={`macro-remaining-${key}`}
                        className={cn(
                            'flex min-w-0 flex-col gap-1.5',
                            variant === 'tiles' && 'rounded-tile border border-line bg-surface px-3 py-2.5',
                        )}
                    >
                        <span className="text-[13px] font-semibold leading-[18px]" style={{ color: MACRO_TEXT_COLORS[key] }}>
                            {label}
                        </span>
                        <span aria-hidden="true" className="flex items-baseline gap-1">
                            <span className={cn('text-fg', variant === 'tiles' ? 'text-xl leading-6 font-semibold tabular-nums' : 'type-num-l')}>
                                {over ? `+${-left}` : left}
                            </span>
                            <span className="text-sm font-medium text-fg">{t('units.gram')}</span>
                        </span>
                        <span aria-hidden="true" className={cn('-mt-1 text-xs', over ? 'font-medium text-warning-fg' : 'text-fg-subtle')}>
                            {over ? t('ui.macroRemaining.over') : t('ui.macroRemaining.left')}
                        </span>
                        <ProgressBar value={e} max={g} color={MACRO_COLORS[key]} thickness={variant === 'tiles' ? 3 : 4} label={aria} />
                        <span aria-hidden="true" className="text-[13px] text-fg-muted tabular-nums">
                            {t('ui.macroRemaining.ofGoal', { eaten: e, goal: g })}
                        </span>
                    </div>
                )
            })}
        </div>
    )
}
