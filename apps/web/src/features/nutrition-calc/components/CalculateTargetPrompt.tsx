'use client'

/**
 * Приглашение посчитать норму — там, где норма отсутствует.
 *
 * На месте нормы раньше стояли 2000 ккал и 150 г белка. Это не значение по
 * умолчанию и не оценка: число придумано, а вокруг него считались проценты
 * выполнения, цвет калорий и алерты куратору. На проде из 18 клиентов норму
 * можно посчитать у 2 — остальные 16 видели придуманную как свою.
 *
 * Приглашение ведёт по адресу, а не в общие настройки: пол, дата рождения и рост
 * заполняются в «Теле и целях», а вес — на главной, потому что в «Теле и целях»
 * он показан только для чтения. Кнопка, ведущая не туда, хуже её отсутствия.
 */

import Link from 'next/link'
import { ArrowRight, Calculator } from 'lucide-react'

import { t } from '@/shared/i18n'
import type { MissingTargetInputs } from '../types'

export interface CalculateTargetPromptProps {
    /** Чего не хватает. `null` — сервер не сказал; приглашение всё равно уместно. */
    missing: MissingTargetInputs | null
    className?: string
}

function explain(missing: MissingTargetInputs | null): string {
    if (!missing) return t('foodTracker.noTarget.unknown')
    if (missing.profile && missing.weight) return t('foodTracker.noTarget.both')
    if (missing.weight) return t('foodTracker.noTarget.weight')
    return t('foodTracker.noTarget.profile')
}

/** Куда вести: за весом — на главную, за остальным — в «Тело и цели». */
function destination(missing: MissingTargetInputs | null): { href: string; label: string } {
    if (missing && missing.weight && !missing.profile) {
        return { href: '/dashboard', label: t('foodTracker.noTarget.actionWeight') }
    }
    return { href: '/settings/body', label: t('foodTracker.noTarget.actionProfile') }
}

export function CalculateTargetPrompt({ missing, className = '' }: CalculateTargetPromptProps) {
    const { href, label } = destination(missing)

    // Нейтральная плитка, а не терракотовая: приглашение стоит внутри карточек,
    // у которых своё главное действие, и вторая заливка бренда спорила бы с ним.
    // Действие — ссылкой (`text-primary font-semibold`), как велит рецепт.
    return (
        <div className={`rounded-tile bg-subtle p-4 ${className}`}>
            <div className="flex items-start gap-3">
                <Calculator className="mt-0.5 h-5 w-5 shrink-0 text-fg-muted" strokeWidth={1.8} aria-hidden="true" />
                <div className="min-w-0">
                    <p className="type-headline text-fg">
                        {t('foodTracker.noTarget.title')}
                    </p>
                    <p className="mt-1 text-sm text-fg-muted">{explain(missing)}</p>
                    <Link
                        href={href}
                        className="-mb-2 mt-1 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
                    >
                        {label}
                        <ArrowRight className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
                    </Link>
                </div>
            </div>
        </div>
    )
}

CalculateTargetPrompt.displayName = 'CalculateTargetPrompt'
