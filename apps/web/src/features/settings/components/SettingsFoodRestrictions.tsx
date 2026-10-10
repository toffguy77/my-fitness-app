'use client'

import { ClientFoodRestrictions } from '@/features/recipes'
import { t } from '@/shared/i18n'
import { SettingsPageLayout } from './SettingsPageLayout'

/** «Ограничения в питании»: аллергены, продукты-исключения, скрытые блюда. */
export function SettingsFoodRestrictions() {
    return (
        <SettingsPageLayout title={t('settings.titles.foodRestrictions')}>
            {() => <ClientFoodRestrictions />}
        </SettingsPageLayout>
    )
}
