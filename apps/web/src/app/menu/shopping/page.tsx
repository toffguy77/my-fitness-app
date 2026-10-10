'use client'

import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { ShoppingList } from '@/features/meal-plan'
import { t } from '@/shared/i18n'

/**
 * Список покупок по планам питания. Раздел «Меню» закрыт для гостей
 * (proxy.ts), а маршрут списка отвечает только клиенту.
 */
export default function ShoppingListPage() {
    return (
        <div className="mx-auto flex w-full max-w-content flex-col gap-5 px-screen-x py-5">
            <header className="flex flex-col gap-1">
                <Link
                    href="/menu"
                    className="inline-flex min-h-11 items-center gap-1 self-start text-sm font-semibold text-primary hover:underline"
                >
                    <ChevronLeft className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                    {t('mealPlan.shopping.back')}
                </Link>
                <h1 className="type-title-1 text-fg">{t('mealPlan.shopping.title')}</h1>
                <p className="text-sm text-fg-muted">{t('mealPlan.shopping.subtitle')}</p>
            </header>
            <ShoppingList />
        </div>
    )
}
