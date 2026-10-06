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
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/Card'
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

export const FirstWeekChecklist = memo(function FirstWeekChecklist({
    state,
    className,
}: FirstWeekChecklistProps) {
    // Ответа нет — нечего и утверждать. Сюда попадает и ожидание, и ошибка: в
    // обоих случаях о действиях человека мы не знаем ничего.
    if (!state || !state.active) return null

    const done = state.steps.filter((step) => step.done).length

    return (
        <Card className={cn('w-full', className)} variant="bordered">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-lg font-semibold text-fg">
                    {t('dashboard.firstWeek.title')}
                </CardTitle>
                <span className="text-sm font-medium text-fg-muted" data-testid="first-week-progress">
                    {t('dashboard.firstWeek.progress', { done, total: state.steps.length })}
                </span>
            </CardHeader>

            <CardContent>
                <ul className="space-y-1">
                    {state.steps.map((step) => (
                        <li key={step.key}>
                            <Link
                                href={STEP_LINKS[step.key]}
                                className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-canvas"
                            >
                                <span
                                    className={cn(
                                        'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border',
                                        step.done
                                            ? 'border-success bg-success'
                                            : 'border-line bg-surface'
                                    )}
                                    aria-hidden="true"
                                >
                                    {step.done && <Check className="h-3 w-3 text-on-primary" strokeWidth={3} />}
                                </span>

                                <span
                                    className={cn(
                                        'flex-1 text-sm',
                                        step.done ? 'text-fg-subtle line-through' : 'text-fg'
                                    )}
                                >
                                    {t(STEP_LABEL_KEYS[step.key])}
                                </span>

                                {/* Отметка выполнения дублируется текстом: по одному
                                    цвету галочки состояние не прочитать тому, кто
                                    цвета не различает. */}
                                {step.done ? (
                                    <span className="text-xs font-medium text-success-fg">
                                        {t('dashboard.firstWeek.done')}
                                    </span>
                                ) : (
                                    <ChevronRight className="h-4 w-4 flex-shrink-0 text-fg-subtle" aria-hidden="true" />
                                )}
                            </Link>
                        </li>
                    ))}
                </ul>
            </CardContent>
        </Card>
    )
})
