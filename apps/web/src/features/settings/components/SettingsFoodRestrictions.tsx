'use client'

import { MealPlanSettingsForm } from '@/features/meal-plan'
import { ClientFoodRestrictions } from '@/features/recipes'
import { t } from '@/shared/i18n'
import { SettingsPageLayout } from './SettingsPageLayout'

/**
 * «Ограничения в питании»: аллергены, продукты-исключения, скрытые блюда и
 * приёмы пищи, которые собирает план дня.
 */
export function SettingsFoodRestrictions() {
    return (
        <SettingsPageLayout title={t('settings.titles.foodRestrictions')}>
            {() => (
                <div className="flex flex-col gap-10">
                    <ClientFoodRestrictions />
                    <MealPlanSettingsForm />
                </div>
            )}
        </SettingsPageLayout>
    )
}
