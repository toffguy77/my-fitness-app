import { t } from '@/shared/i18n'
import { cn } from '@/shared/utils/cn'
import type { Nutrition } from '../types'
import { formatAmount } from '../utils/recipeInput'

interface NutritionLineProps {
    nutrition: Nutrition
    className?: string
}

/** «420 ккал · Б 30 · Ж 12 · У 45» — калории числом, нутриенты своим цветом. */
export function NutritionLine({ nutrition, className }: NutritionLineProps) {
    return (
        <p className={cn('flex flex-wrap items-baseline gap-x-2 text-sm tabular-nums', className)}>
            <span className="font-semibold text-fg">{t('recipes.nutrition.kcal', { value: Math.round(nutrition.kcal) })}</span>
            <span className="text-protein-fg">{t('recipes.nutrition.protein', { value: formatAmount(nutrition.protein) })}</span>
            <span className="text-fat-fg">{t('recipes.nutrition.fat', { value: formatAmount(nutrition.fat) })}</span>
            <span className="text-carbs-fg">{t('recipes.nutrition.carbs', { value: formatAmount(nutrition.carbs) })}</span>
        </p>
    )
}
