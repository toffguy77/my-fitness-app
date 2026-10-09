'use client'

import Link from 'next/link'
import { EVENTS, track } from '@/shared/analytics'
import { buttonBase, buttonSizes, buttonVariants } from '@/shared/components/ui/Button'
import { cn } from '@/shared/utils/cn'

/**
 * The block under every public article.
 *
 * Readers arrive from search, finish the article and leave; this is where the
 * article hands them on. The links are ordinary anchors — the block is in the
 * HTML and works without JavaScript — and the click is recorded on the way out
 * without holding the navigation up.
 */
export function ArticleCta() {
    return (
        <aside className="mt-10 rounded-card border border-line bg-surface p-5">
            <h2 className="type-title-2 text-fg">Узнайте свою норму КБЖУ</h2>
            <p className="mt-2 type-callout text-fg-muted">
                Калькулятор посчитает калории, белки, жиры и углеводы под вашу цель за минуту.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
                <Link
                    href="/kalkulyator-kbzhu"
                    onClick={() => track(EVENTS.articleCtaClicked, { target: 'calculator' })}
                    className={cn(buttonBase, buttonVariants.primary, buttonSizes.lg)}
                >
                    Рассчитать мою норму
                </Link>
                <Link
                    href="/pricing"
                    onClick={() => track(EVENTS.articleCtaClicked, { target: 'pricing' })}
                    className="inline-flex min-h-11 items-center text-[15px] font-semibold text-primary hover:underline"
                >
                    Тарифы
                </Link>
            </div>
        </aside>
    )
}
