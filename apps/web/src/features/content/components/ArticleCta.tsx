'use client'

import Link from 'next/link'
import { EVENTS, track } from '@/shared/analytics'

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
        <aside className="mt-10 rounded-2xl bg-primary-soft p-6">
            <h2 className="text-lg font-semibold text-fg">Узнайте свою норму КБЖУ</h2>
            <p className="mt-1 text-sm text-fg-muted">
                Калькулятор посчитает калории, белки, жиры и углеводы под вашу цель за минуту.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-4">
                <Link
                    href="/kalkulyator-kbzhu"
                    onClick={() => track(EVENTS.articleCtaClicked, { target: 'calculator' })}
                    className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-on-primary hover:bg-primary-hover"
                >
                    Рассчитать мою норму
                </Link>
                <Link
                    href="/pricing"
                    onClick={() => track(EVENTS.articleCtaClicked, { target: 'pricing' })}
                    className="text-sm font-medium text-primary hover:underline"
                >
                    Тарифы
                </Link>
            </div>
        </aside>
    )
}
