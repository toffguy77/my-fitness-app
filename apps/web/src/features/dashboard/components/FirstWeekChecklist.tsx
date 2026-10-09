'use client'

/**
 * FirstWeekChecklist — что делать новичку на первом экране.
 *
 * Заменяет собой блок «Недостаточно данных», занимавший пол-экрана. Та надпись
 * ничего новичку не сообщала: он и сам знает, что данных ещё нет, а что с этим
 * делать — не знал.
 *
 * Два правила, за которыми стоит следить при правках:
 *
 *   1. Состав пунктов приходит с сервера и перебирается как есть. Пункт,
 *      требующий отключённой способности, в ответе отсутствует — и показать его
 *      здесь нечем. Сверять список с собственным набором значило бы решать за
 *      сервер и однажды выдать задание, которое кончится 503.
 *   2. На упавшем запросе чек-лист не рисуется вовсе. Непроставленная отметка —
 *      это сообщение «ты не заполнил профиль», и адресовать его человеку, который
 *      профиль заполнил, — тот же дефект, что закреплён тестом в
 *      errorCauses.test.tsx: интерфейс врёт о действиях человека.
 */

import { memo } from 'react'
import Link from 'next/link'
import { Check, ChevronRight } from 'lucide-react'
import { Card, CardTitle } from '@/shared/components/ui/Card'
import { cn } from '@/shared/utils/cn'
import { t } from '@/shared/i18n'
import type { OnboardingState, OnboardingStepKey } from '../types'

export interface FirstWeekChecklistProps {
    state: OnboardingState | null
    className?: string
}

/**
 * Куда ведёт каждый пункт — туда, где его можно выполнить немедленно.
 *
 * `plate_photo` ведёт с `?add=photo`: распознавание живёт внутри окна записи еды,
 * и без параметра ссылка высаживала бы человека на вкладку рациона, откуда
 * нужное искать три клика вглубь. Пункт, который нельзя выполнить по ссылке из
 * него самого, хуже отсутствующего.
 */
const STEP_LINKS: Record<OnboardingStepKey, string> = {
    profile: '/settings/body',
    first_meal: '/food-tracker',
    plate_photo: '/food-tracker?add=photo',
    curator_hello: '/chat',
}

const STEP_LABEL_KEYS: Record<OnboardingStepKey, string> = {
    profile: 'dashboard.firstWeek.steps.profile',
    first_meal: 'dashboard.firstWeek.steps.firstMeal',
    plate_photo: 'dashboard.firstWeek.steps.platePhoto',
    curator_hello: 'dashboard.firstWeek.steps.curatorHello',
}

/** Строка-подсказка под пунктом: зачем он и как его выполнить. */
const STEP_HINT_KEYS: Record<OnboardingStepKey, string> = {
    profile: 'dashboard.firstWeek.hints.profile',
    first_meal: 'dashboard.firstWeek.hints.firstMeal',
    plate_photo: 'dashboard.firstWeek.hints.platePhoto',
    curator_hello: 'dashboard.firstWeek.hints.curatorHello',
}

export const FirstWeekChecklist = memo(function FirstWeekChecklist({
    state,
    className,
}: FirstWeekChecklistProps) {
    // Ответа нет — нечего и утверждать. Сюда попадает и ожидание, и ошибка: в
    // обоих случаях о действиях человека мы не знаем ничего.
    if (!state || !state.active) return null

    const done = state.steps.filter((step) => step.done).length

    // «План на сегодня» в языке «Коуча»: заголовок засечками, пункты —
    // строками с отметкой и строкой-подсказкой под названием, строки
    // разделены линией. Выполненное — знаком, зачёркиванием и словом.
    return (
        <Card className={cn('w-full', className)}>
            <div className="mb-1 flex items-baseline justify-between gap-3">
                <CardTitle className="type-title-2 text-fg">
                    {t('dashboard.firstWeek.title')}
                </CardTitle>
                <span className="type-caption text-fg-muted tabular-nums" data-testid="first-week-progress">
                    {t('dashboard.firstWeek.progress', { done, total: state.steps.length })}
                </span>
            </div>

            <ul className="-mx-2 divide-y divide-line">
                {state.steps.map((step) => (
                    <li key={step.key}>
                        <Link
                            href={STEP_LINKS[step.key]}
                            className="flex min-h-14 items-start gap-3 rounded-tile px-2 py-3 transition-colors hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                        >
                            <span
                                className={cn(
                                    'mt-px flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                                    step.done ? 'border-success bg-success' : 'border-line-strong'
                                )}
                                aria-hidden="true"
                            >
                                {step.done && <Check className="h-3.5 w-3.5 text-on-primary" strokeWidth={3} />}
                            </span>

                            <span className="min-w-0 flex-1">
                                <span
                                    className={cn(
                                        'block type-headline',
                                        step.done ? 'text-fg-muted line-through' : 'text-fg'
                                    )}
                                >
                                    {t(STEP_LABEL_KEYS[step.key])}
                                </span>
                                {!step.done && (
                                    <span className="mt-0.5 block type-caption text-fg-muted">
                                        {t(STEP_HINT_KEYS[step.key])}
                                    </span>
                                )}
                            </span>

                            {/* Отметка выполнения дублируется текстом: по одному
                                цвету галочки состояние не прочитать тому, кто
                                цвета не различает. */}
                            {step.done ? (
                                <span className="mt-0.5 type-caption font-medium text-success-fg">
                                    {t('dashboard.firstWeek.done')}
                                </span>
                            ) : (
                                <ChevronRight className="mt-0.5 h-5 w-5 flex-shrink-0 text-fg-subtle" strokeWidth={1.8} aria-hidden="true" />
                            )}
                        </Link>
                    </li>
                ))}
            </ul>
        </Card>
    )
})
