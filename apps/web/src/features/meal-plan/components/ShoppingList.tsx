'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { Copy, Share2, ShoppingBasket } from 'lucide-react'
import { useResource } from '@/features/recipes/hooks/useResource'
import { EVENTS, track } from '@/shared/analytics'
import { ErrorState } from '@/shared/components/ErrorState'
import { Button } from '@/shared/components/ui/Button'
import { Input } from '@/shared/components/ui/Input'
import { Spinner } from '@/shared/components/ui/Spinner'
import { t } from '@/shared/i18n'
import { cn } from '@/shared/utils/cn'
import { mealPlanApi } from '../api/mealPlanApi'
import type { ShoppingItem, ShoppingMark, ShoppingMarks } from '../types'
import { addDays, daysBetween } from '../utils/planDates'
import { loadMarks, marksKey, saveMarks, toggleMark } from '../utils/shoppingMarks'
import { formatShoppingList, formatShoppingRange } from '../utils/shoppingText'

/** Сервер отдаёт не больше 14 дней включительно (иначе `422`). */
export const MAX_SHOPPING_DAYS = 14

interface Range {
    from: string
    to: string
}

/**
 * Новый диапазон после правки одного конца: второй конец подтягивается, чтобы
 * конец не был раньше начала и диапазон не выходил за 14 дней.
 */
export function adjustRange(current: Range, edited: 'from' | 'to', value: string): Range {
    if (edited === 'from') {
        let to = current.to < value ? value : current.to
        if (daysBetween(value, to) >= MAX_SHOPPING_DAYS) to = addDays(value, MAX_SHOPPING_DAYS - 1)
        return { from: value, to }
    }
    let from = current.from > value ? value : current.from
    if (daysBetween(from, value) >= MAX_SHOPPING_DAYS) from = addDays(value, -(MAX_SHOPPING_DAYS - 1))
    return { from, to: value }
}

async function writeClipboard(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text)
        return true
    } catch {
        return false
    }
}

function isAbort(err: unknown): boolean {
    return err instanceof Error && err.name === 'AbortError'
}

interface RowProps {
    item: ShoppingItem
    mark: ShoppingMark | undefined
    onMark: (mark: ShoppingMark) => void
}

function ShoppingRow({ item, mark, onMark }: RowProps) {
    const toggle = (value: ShoppingMark, label: string, aria: string) => (
        <button
            type="button"
            aria-pressed={mark === value}
            aria-label={aria}
            onClick={() => onMark(value)}
            className={cn(
                'inline-flex min-h-11 items-center rounded-full border px-3 text-sm font-medium transition-colors touch-manipulation',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                mark === value
                    ? 'border-line-strong bg-subtle text-fg'
                    : 'border-line text-fg-subtle hover:text-fg'
            )}
        >
            {label}
        </button>
    )

    return (
        <li
            data-testid={`shopping-item-${item.food_id}`}
            data-mark={mark ?? 'none'}
            className="flex items-center gap-2 border-b border-line py-2 last:border-b-0"
        >
            <div className={cn('flex min-w-0 flex-1 flex-col', mark && 'text-fg-subtle line-through opacity-70')}>
                <span className={cn('text-base', !mark && 'text-fg')}>{item.name}</span>
                <span className="text-sm text-fg-muted tabular-nums">{item.quantity_text}</span>
            </div>
            {toggle('have', t('mealPlan.shopping.have'), t('mealPlan.shopping.haveAria', { name: item.name }))}
            {toggle('bought', t('mealPlan.shopping.bought'), t('mealPlan.shopping.boughtAria', { name: item.name }))}
        </li>
    )
}

/**
 * Список покупок за диапазон дат: продукты всех блюд из планов, сложенные и
 * разложенные по отделам. Отметки «есть» и «купил» живут на устройстве, по
 * ключу диапазона; «Скопировать» и «Поделиться» отдают текст без отмеченного.
 */
export function ShoppingList() {
    // null — диапазон по умолчанию от сервера: сегодня и последний день с планом.
    const [range, setRange] = useState<Range | null>(null)
    const load = useCallback(() => mealPlanApi.shoppingList(range ?? undefined), [range])
    const { data: list, error, loading, reload } = useResource(load)
    const [stored, setStored] = useState<{ key: string; marks: ShoppingMarks } | null>(null)
    const [sharing, setSharing] = useState(false)

    useEffect(() => {
        if (list) track(EVENTS.shoppingListOpened, { days: daysBetween(list.from, list.to) + 1 })
    }, [list])

    const key = list ? marksKey(list.from, list.to) : null
    const marks: ShoppingMarks = key ? (stored?.key === key ? stored.marks : loadMarks(key)) : {}
    const shown: Range | null = list ? { from: list.from, to: list.to } : range

    const mark = (foodId: string, value: ShoppingMark) => {
        if (!key) return
        const next = toggleMark(marks, foodId, value)
        saveMarks(key, next)
        setStored({ key, marks: next })
    }

    const edit = (edited: 'from' | 'to', value: string) => {
        if (!value || !shown) return
        setRange(adjustRange(shown, edited, value))
    }

    const copy = async (text: string) => {
        if (await writeClipboard(text)) {
            toast.success(t('mealPlan.shopping.copied'))
            track(EVENTS.shoppingListShared, { method: 'copy' })
        } else {
            toast.error(t('mealPlan.shopping.copyFailed'))
        }
    }

    const handleCopy = async () => {
        if (list) await copy(formatShoppingList(list, marks))
    }

    // Системное «Поделиться», а без него — копирование: на компьютере его
    // обычно нет, и кнопка не должна молчать.
    const handleShare = async () => {
        if (!list) return
        const text = formatShoppingList(list, marks)
        setSharing(true)
        try {
            if (typeof navigator.share === 'function') {
                try {
                    await navigator.share({ title: t('mealPlan.shopping.title'), text })
                    track(EVENTS.shoppingListShared, { method: 'share' })
                    return
                } catch (err) {
                    if (isAbort(err)) return
                }
            }
            await copy(text)
        } finally {
            setSharing(false)
        }
    }

    const empty = list && list.departments.length === 0 && list.at_home.length === 0

    return (
        <section className="flex flex-col gap-4" aria-label={t('mealPlan.shopping.title')}>
            <div className="grid grid-cols-2 gap-3" role="group" aria-label={t('mealPlan.shopping.rangeAria')}>
                <Input
                    id="shopping-from"
                    type="date"
                    label={t('mealPlan.shopping.from')}
                    value={shown?.from ?? ''}
                    onChange={(event) => edit('from', event.target.value)}
                    disabled={!shown}
                />
                <Input
                    id="shopping-to"
                    type="date"
                    label={t('mealPlan.shopping.to')}
                    value={shown?.to ?? ''}
                    onChange={(event) => edit('to', event.target.value)}
                    disabled={!shown}
                />
            </div>
            <p className="text-xs text-fg-subtle">{t('mealPlan.shopping.rangeHint', { days: MAX_SHOPPING_DAYS })}</p>

            {loading && !list ? (
                <Spinner label={t('mealPlan.shopping.loading')} />
            ) : error && !list ? (
                <ErrorState
                    variant="inline"
                    title={t('mealPlan.shopping.loadFailed')}
                    onRetry={reload}
                    showHomeLink={false}
                />
            ) : list && !list.has_plans ? (
                <div className="flex flex-col items-start gap-3 rounded-tile bg-subtle p-4" data-testid="shopping-no-plans">
                    <ShoppingBasket className="h-6 w-6 text-fg-subtle" strokeWidth={1.8} aria-hidden="true" />
                    <p className="type-title-3 text-fg">{t('mealPlan.shopping.noPlans')}</p>
                    <p className="text-sm text-fg-muted">{t('mealPlan.shopping.noPlansHint')}</p>
                    <Link
                        href="/menu"
                        className="inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline"
                    >
                        {t('mealPlan.shopping.openPlan')}
                    </Link>
                </div>
            ) : list && empty ? (
                <p className="text-sm text-fg-muted" data-testid="shopping-nothing">
                    {t('mealPlan.shopping.nothing')}
                </p>
            ) : list ? (
                <>
                    <h2 className="type-title-3 text-fg first-letter:uppercase" data-testid="shopping-range">
                        {formatShoppingRange(list.from, list.to)}
                    </h2>
                    {list.departments.map((department) => (
                        <section key={department.name} aria-label={department.name} className="flex flex-col gap-1">
                            <h3 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">
                                {department.name}
                            </h3>
                            <ul className="flex flex-col">
                                {department.items.map((item) => (
                                    <ShoppingRow
                                        key={item.food_id}
                                        item={item}
                                        mark={marks[item.food_id]}
                                        onMark={(value) => mark(item.food_id, value)}
                                    />
                                ))}
                            </ul>
                        </section>
                    ))}
                    {list.at_home.length > 0 && (
                        <section
                            aria-label={t('mealPlan.shopping.atHome')}
                            className="flex flex-col gap-1 rounded-tile bg-subtle p-4"
                            data-testid="shopping-at-home"
                        >
                            <h3 className="text-sm font-semibold text-fg">{t('mealPlan.shopping.atHome')}</h3>
                            <p className="text-sm text-fg-muted">{list.at_home.join(', ')}</p>
                        </section>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                        <Button variant="secondary" block onClick={handleCopy}>
                            <Copy className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                            {t('mealPlan.shopping.copy')}
                        </Button>
                        <Button variant="primary" block onClick={handleShare} isLoading={sharing} disabled={sharing}>
                            <Share2 className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                            {t('mealPlan.shopping.share')}
                        </Button>
                    </div>
                    <p className="text-xs text-fg-subtle">{t('mealPlan.shopping.marksHint')}</p>
                </>
            ) : null}
        </section>
    )
}
