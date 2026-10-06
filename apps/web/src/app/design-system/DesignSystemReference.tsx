'use client'

/**
 * Справочник дизайн-системы BURCEV — рабочая витрина компонентов.
 *
 * Здесь собираются те же компоненты, что в приложении, на примерных данных:
 * когда меняется токен или компонент, разница видна сразу в обеих темах, без
 * входа в учётную запись и без бэкенда. Правила — docs/design-system/README.md.
 */

import { useState } from 'react'
import { color, values } from '@burcev/design-tokens'
import { Button, IconButton } from '@/shared/components/ui/Button'
import { Card, CardTitle } from '@/shared/components/ui/Card'
import { ProgressBar } from '@/shared/components/ui/ProgressBar'
import { ProgressArc } from '@/shared/components/ui/ProgressArc'
import { MacroRemaining } from '@/shared/components/ui/MacroRemaining'
import { WeekDots, weekSummary, type WeekDotsDay } from '@/shared/components/ui/WeekDots'
import { QuickAddActions, QuickAddBar } from '@/shared/components/ui/QuickAdd'
import { KBZHUSummary } from '@/features/food-tracker/components/KBZHUSummary'
import { MealSlot } from '@/features/food-tracker/components/MealSlot'
import type { FoodEntry } from '@/features/food-tracker/types'
import { ArrowRight, Bell } from 'lucide-react'
import { applyThemePreference, type ThemePreference } from '@/shared/theme/theme'

type Theme = ThemePreference

const ROLE_GROUPS: { title: string; roles: (keyof typeof color)[] }[] = [
    { title: 'Поверхности', roles: ['canvas', 'surface', 'subtle', 'line', 'line-strong', 'track'] },
    { title: 'Текст', roles: ['fg', 'fg-muted', 'fg-subtle', 'fg-disabled'] },
    { title: 'Бренд и куратор', roles: ['primary', 'primary-hover', 'primary-soft', 'coach', 'on-coach', 'on-coach-muted'] },
    { title: 'Нутриенты', roles: ['protein', 'protein-fg', 'fat', 'fat-fg', 'carbs', 'carbs-fg', 'water'] },
    { title: 'Состояния', roles: ['success', 'success-fg', 'warning', 'warning-fg', 'danger', 'danger-fg', 'info', 'info-fg'] },
]

const TYPE_SCALE = [
    ['type-display', 'Сегодня', 'display · Literata 34/40'],
    ['type-title-1', 'Доброе утро, Дмитрий', 'title-1 · Literata 30/36'],
    ['type-title-2', 'План на сегодня', 'title-2 · Literata 22/28'],
    ['type-title-3', 'Завтрак', 'title-3 · Literata 18/24'],
    ['type-quote', '«Сегодня добавь овощей к ужину»', 'quote · Literata italic 19/28'],
    ['type-num-xl', '944', 'num-xl · Golos 44/48 tabular'],
    ['type-num-l', '128 г', 'num-l · Golos 22/26 tabular'],
    ['type-headline', 'Куриная грудка гриль', 'headline · Golos 16/22'],
    ['type-body', 'Основной текст интерфейса', 'body · Golos 16/24'],
    ['type-caption', '180 г · Б 42 · Ж 6 · У 0', 'caption · Golos 13/18'],
    ['type-overline', 'Неделя 22–28 сентября', 'overline · Golos 13/18 caps'],
] as const

const WEEK: WeekDotsDay[] = [
    { date: '2026-09-22', label: 'Вт', deviation: -0.02 },
    { date: '2026-09-23', label: 'Ср', deviation: 0.04 },
    { date: '2026-09-24', label: 'Чт', deviation: -0.12 },
    { date: '2026-09-25', label: 'Пт', deviation: -0.01 },
    { date: '2026-09-26', label: 'Сб', deviation: 0.18 },
    { date: '2026-09-27', label: 'Вс', deviation: -0.04 },
    { date: '2026-09-28', label: 'Пн', deviation: null, isToday: true },
]

const entry = (id: string, name: string, meal: FoodEntry['mealType'], time: string, grams: number, k: number, p: number, f: number, c: number): FoodEntry => ({
    id, foodId: id, foodName: name, mealType: meal, portionType: 'grams', portionAmount: grams,
    nutrition: { calories: k, protein: p, fat: f, carbs: c }, time, date: '2026-09-28',
    createdAt: '2026-09-28T08:10:00Z', updatedAt: '2026-09-28T08:10:00Z',
})

const BREAKFAST = [
    entry('1', 'Овсянка на молоке', 'breakfast', '08:10', 250, 312, 11, 10, 43),
    entry('2', 'Яйцо куриное варёное', 'breakfast', '08:10', 110, 157, 14, 11, 1),
    entry('3', 'Кофе с молоком', 'breakfast', '08:12', 250, 76, 4, 4, 6),
]
const LUNCH = [
    entry('4', 'Куриная грудка гриль', 'lunch', '13:30', 180, 214, 42, 6, 0),
    entry('5', 'Гречка отварная', 'lunch', '13:30', 150, 165, 5, 2, 30),
]

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="flex flex-col gap-4">
            <h2 className="type-overline text-fg-subtle">{title}</h2>
            {children}
        </section>
    )
}

export function DesignSystemReference() {
    const [theme, setTheme] = useState<Theme>('system')

    const applyTheme = (next: Theme) => {
        setTheme(next)
        applyThemePreference(next)
    }

    const { inside, total } = weekSummary(WEEK)

    return (
        <main className="mx-auto flex max-w-5xl flex-col gap-12 px-screen-x py-10">
            <header className="flex flex-wrap items-end justify-between gap-6">
                <div className="flex flex-col gap-2">
                    <span className="type-overline text-primary">BURCEV</span>
                    <h1 className="type-display text-fg">Дизайн-система «Коуч + Ясность»</h1>
                    <p className="max-w-xl type-body text-fg-muted">
                        Тёплая бумага и чернила; куратор и план дня — первыми, цифры — точно до грамма.
                        Значения — в packages/design-tokens, правила — в docs/design-system.
                    </p>
                </div>
                <div role="radiogroup" aria-label="Тема" className="flex rounded-full border border-line p-1">
                    {(['system', 'light', 'dark'] as const).map((t) => (
                        <button
                            key={t}
                            type="button"
                            role="radio"
                            aria-checked={theme === t}
                            onClick={() => applyTheme(t)}
                            className={`h-9 rounded-full px-4 text-sm font-semibold transition-colors ${theme === t ? 'bg-fg text-fg-inverse' : 'text-fg-muted hover:text-fg'}`}
                        >
                            {t === 'system' ? 'Система' : t === 'light' ? 'Светлая' : 'Тёмная'}
                        </button>
                    ))}
                </div>
            </header>

            <Section title="Цвет · роли">
                <div className="grid gap-6 md:grid-cols-2">
                    {ROLE_GROUPS.map((group) => (
                        <div key={group.title} className="flex flex-col gap-3">
                            <h3 className="type-headline text-fg">{group.title}</h3>
                            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                                {group.roles.map((role) => (
                                    <div key={role} className="flex flex-col gap-1.5">
                                        <div className="h-12 rounded-tile border border-line" style={{ backgroundColor: color[role] }} />
                                        <code className="text-xs text-fg-muted">{role}</code>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
                <p className="type-caption text-fg-subtle">
                    Светлый фон экрана {values.light['color.bg.canvas']}, тёмный {values.dark['color.bg.canvas']}. Контраст текста проверяется при сборке токенов.
                </p>
            </Section>

            <Section title="Типографика">
                <Card className="flex flex-col divide-y divide-line p-0">
                    {TYPE_SCALE.map(([cls, sample, note]) => (
                        <div key={cls} className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-3">
                            <span className={`${cls} text-fg`}>{sample}</span>
                            <code className="text-xs text-fg-subtle">{note}</code>
                        </div>
                    ))}
                </Card>
            </Section>

            <Section title="Действия">
                <div className="flex flex-wrap items-center gap-3">
                    <Button size="lg">Записать еду</Button>
                    <Button variant="secondary" size="lg">Вторичная</Button>
                    <Button variant="ghost" size="lg">Без подложки</Button>
                    <Button variant="danger" size="lg">Удалить</Button>
                    <Button size="lg" disabled>Недоступно</Button>
                    <IconButton aria-label="Уведомления"><Bell className="h-5 w-5" strokeWidth={1.8} /></IconButton>
                </div>
            </Section>

            <Section title="Данные">
                <div className="grid gap-6 md:grid-cols-2">
                    <Card className="flex flex-col gap-4">
                        <CardTitle className="type-title-2">Питание</CardTitle>
                        <ProgressArc value={1206} max={2150} label="Калории: съедено 1206 из 2150, осталось 944">
                            <span className="type-num-xl text-fg">944</span>
                            <span className="text-sm text-fg-muted">ккал ещё можно · съедено 1206 из 2150</span>
                        </ProgressArc>
                        <MacroRemaining
                            className="border-t border-line pt-4"
                            eaten={{ protein: 91, fat: 43, carbs: 112 }}
                            goal={{ protein: 140, fat: 70, carbs: 240 }}
                        />
                        <QuickAddActions onSelect={() => {}} />
                    </Card>
                    <div className="flex flex-col gap-6">
                        <Card variant="coach" className="flex flex-col gap-3.5">
                            <span className="flex items-center gap-3">
                                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-[13px] font-semibold text-on-primary">АС</span>
                                <span className="flex flex-col">
                                    <span className="text-[13px] text-on-coach-muted">Ваш куратор</span>
                                    <span className="text-[15px] font-semibold">Анна Соколова</span>
                                </span>
                            </span>
                            <span className="type-quote">«Белок вчера — отлично. Сегодня добавь овощей к ужину.»</span>
                            <span className="flex items-center gap-1.5 text-[15px] font-semibold">Ответить <ArrowRight className="h-4 w-4" /></span>
                        </Card>
                        <Card className="flex flex-col gap-3.5">
                            <div className="flex items-baseline justify-between">
                                <CardTitle className="type-title-2">Неделя</CardTitle>
                                <span className="text-[15px] font-semibold">{inside} из {total} <span className="font-normal text-fg-muted">в норме</span></span>
                            </div>
                            <WeekDots days={WEEK} />
                        </Card>
                        <div className="flex flex-col gap-2">
                            <ProgressBar value={91} max={140} color={color.protein} label="Белки" />
                            <ProgressBar value={43} max={70} color={color.fat} label="Жиры" />
                            <ProgressBar value={112} max={240} color={color.carbs} label="Углеводы" />
                        </div>
                    </div>
                </div>
            </Section>

            <Section title="Дневник питания">
                <div className="mx-auto flex w-full max-w-md flex-col gap-4">
                    <KBZHUSummary
                        current={{ calories: 1206, protein: 91, fat: 43, carbs: 112 }}
                        target={{ calories: 2150, protein: 140, fat: 70, carbs: 240 }}
                    />
                    <div>
                        <MealSlot mealType="breakfast" entries={BREAKFAST} onAddEntry={() => {}} />
                        <MealSlot mealType="lunch" entries={LUNCH} onAddEntry={() => {}} />
                        <MealSlot mealType="dinner" entries={[]} onAddEntry={() => {}} />
                    </div>
                    <QuickAddBar onSelect={() => {}} />
                </div>
            </Section>
        </main>
    )
}
