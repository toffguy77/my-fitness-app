'use client'

import { t } from '@/shared/i18n'
import { cn } from '@/shared/utils/cn'
import { MEAL_TYPES, type MealType } from '../types'

interface MealTypeFilterProps {
    selected: MealType | null
    onSelect: (mealType: MealType | null) => void
}

const CHIP =
    'h-11 shrink-0 rounded-full px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus'

/** Фильтр каталога по приёму пищи: «Все» и четыре приёма, выбранный — чернилами. */
export function MealTypeFilter({ selected, onSelect }: MealTypeFilterProps) {
    const options: { value: MealType | null; label: string }[] = [
        { value: null, label: t('recipes.menu.filterAll') },
        ...MEAL_TYPES.map((value) => ({ value, label: t(`recipes.mealTypes.${value}`) })),
    ]

    return (
        <div
            role="group"
            aria-label={t('recipes.menu.filterAria')}
            className="-mx-screen-x flex gap-2 overflow-x-auto px-screen-x pb-1 scrollbar-hide sm:mx-0 sm:px-0"
        >
            {options.map((option) => (
                <button
                    key={option.value ?? 'all'}
                    type="button"
                    onClick={() => onSelect(option.value)}
                    aria-pressed={selected === option.value}
                    className={cn(
                        CHIP,
                        selected === option.value
                            ? 'bg-fg text-fg-inverse'
                            : 'border border-line bg-surface text-fg-muted hover:bg-subtle'
                    )}
                >
                    {option.label}
                </button>
            ))}
        </div>
    )
}
