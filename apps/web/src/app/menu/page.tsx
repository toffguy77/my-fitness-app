'use client'

import { Suspense, useEffect, useRef, type KeyboardEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { DayPlanView } from '@/features/meal-plan'
import { RecipeCatalogue } from '@/features/recipes'
import { EVENTS, track } from '@/shared/analytics'
import { t } from '@/shared/i18n'
import { cn } from '@/shared/utils/cn'

type MenuTab = 'plan' | 'recipes'

const TABS: { id: MenuTab; label: () => string }[] = [
    { id: 'plan', label: () => t('mealPlan.menu.tabPlan') },
    { id: 'recipes', label: () => t('mealPlan.menu.tabRecipes') },
]

/**
 * «Меню»: вкладка «План» (план на сегодня) открыта по умолчанию, каталог
 * рецептов — соседняя вкладка, и `?tab=recipes` ведёт прямо в него.
 */
function MenuContent() {
    const params = useSearchParams()
    const router = useRouter()
    const active: MenuTab = params.get('tab') === 'recipes' ? 'recipes' : 'plan'
    const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

    // Событие раздела, а не вкладки: «Меню» открыли, на какой бы вкладке.
    useEffect(() => {
        track(EVENTS.menuOpened)
    }, [])

    const select = (tab: MenuTab) => {
        router.replace(tab === 'recipes' ? '/menu?tab=recipes' : '/menu', { scroll: false })
    }

    const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
        event.preventDefault()
        const nextIndex = (index + (event.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length
        select(TABS[nextIndex].id)
        tabRefs.current[nextIndex]?.focus()
    }

    return (
        <div className="mx-auto flex w-full max-w-content flex-col gap-5 px-screen-x py-5">
            <header className="flex flex-col gap-1">
                <h1 className="type-title-1 text-fg">{t('recipes.menu.title')}</h1>
                <p className="text-sm text-fg-muted">{t('mealPlan.menu.subtitle')}</p>
            </header>

            <div role="tablist" aria-label={t('mealPlan.menu.tabsAria')} className="flex gap-6 border-b border-line">
                {TABS.map((tab, index) => {
                    const selected = tab.id === active
                    return (
                        <button
                            key={tab.id}
                            ref={(el) => {
                                tabRefs.current[index] = el
                            }}
                            type="button"
                            role="tab"
                            id={`menu-tab-${tab.id}`}
                            aria-selected={selected}
                            aria-controls={`menu-panel-${tab.id}`}
                            tabIndex={selected ? 0 : -1}
                            onClick={() => select(tab.id)}
                            onKeyDown={(event) => handleKeyDown(event, index)}
                            className={cn(
                                '-mb-px h-11 border-b-2 text-base transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus touch-manipulation',
                                selected
                                    ? 'border-line-strong font-semibold text-fg'
                                    : 'border-transparent font-medium text-fg-subtle hover:text-fg'
                            )}
                        >
                            {tab.label()}
                        </button>
                    )
                })}
            </div>

            <div role="tabpanel" id={`menu-panel-${active}`} aria-labelledby={`menu-tab-${active}`}>
                {active === 'plan' ? <DayPlanView /> : <RecipeCatalogue embedded />}
            </div>
        </div>
    )
}

export default function MenuPage() {
    // useSearchParams в клиентской странице требует границы Suspense для сборки.
    return (
        <Suspense fallback={null}>
            <MenuContent />
        </Suspense>
    )
}
