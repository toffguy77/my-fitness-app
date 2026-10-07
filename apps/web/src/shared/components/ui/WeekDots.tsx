import { cn } from '@/shared/utils/cn'
import { t } from '@/shared/i18n'

export interface WeekDotsDay {
    /** Ключ дня (YYYY-MM-DD). */
    date: string
    /** Подпись под точкой: «Пн». */
    label: string
    /**
     * Отклонение от нормы долей: 0.18 — на 18% выше, −0.12 — на 12% ниже.
     * `null` — данных нет (норма не посчитана или день не записан).
     */
    deviation: number | null
    /** Сегодняшний день ещё идёт: точка показывается пунктирным кольцом без оценки. */
    isToday?: boolean
}

export interface WeekDotsProps {
    days: WeekDotsDay[]
    /** Полуширина полосы нормы. По умолчанию ±5%. */
    tolerance?: number
    className?: string
}

const PLOT_H = 80
const BAND_H = 20
/** Сколько процентов отклонения умещается от центра до края графика. */
const RANGE = 0.25

export function isInside(day: WeekDotsDay, tolerance = 0.05): boolean {
    return day.deviation !== null && !day.isToday && Math.abs(day.deviation) <= tolerance
}

/** «4 из 6»: сколько завершённых дней с данными попали в полосу нормы. */
export function weekSummary(days: WeekDotsDay[], tolerance = 0.05) {
    const counted = days.filter((d) => d.deviation !== null && !d.isToday)
    return { inside: counted.filter((d) => isInside(d, tolerance)).length, total: counted.length }
}

function stateText(day: WeekDotsDay, tolerance: number): string {
    if (day.isToday) return t('ui.weekDots.stateToday')
    if (day.deviation === null) return t('ui.weekDots.stateNoData')
    if (Math.abs(day.deviation) <= tolerance) return t('ui.weekDots.stateInside')
    const percent = Math.round(Math.abs(day.deviation) * 100)
    return day.deviation > 0 ? t('ui.weekDots.stateAbove', { percent }) : t('ui.weekDots.stateBelow', { percent })
}

/**
 * Неделя точками: одна точка на день, высота — отклонение калорий от нормы,
 * полоса — допустимый коридор. Читается за секунду: какие дни в коридоре,
 * какие мимо и в какую сторону. Заменяет линейный график, где ту же мысль
 * приходилось выводить из пересечения двух линий.
 */
export function WeekDots({ days, tolerance = 0.05, className }: WeekDotsProps) {
    const center = PLOT_H / 2
    const scale = center / RANGE
    const bandHalf = Math.max(BAND_H / 2, tolerance * scale)
    return (
        <div className={cn('flex flex-col gap-3', className)}>
            <ol className="relative grid grid-cols-7" style={{ height: PLOT_H + 22 }}>
                <li
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 rounded-[6px] bg-subtle"
                    style={{ top: center - bandHalf, height: bandHalf * 2 }}
                />
                {days.map((day) => {
                    const inside = isInside(day, tolerance)
                    const clamped = day.deviation === null ? 0 : Math.max(-RANGE, Math.min(RANGE, day.deviation))
                    const top = center - clamped * scale - 6
                    return (
                        <li
                            key={day.date}
                            className="relative flex flex-col items-center justify-end"
                            aria-label={t('ui.weekDots.dayAria', { day: day.label, state: stateText(day, tolerance) })}
                        >
                            {day.isToday || day.deviation === null ? (
                                <span
                                    aria-hidden="true"
                                    className={cn(
                                        'absolute h-3 w-3 rounded-full border-2 border-dashed',
                                        day.isToday ? 'border-primary' : 'border-fg-subtle',
                                    )}
                                    style={{ top: center - 6 }}
                                />
                            ) : (
                                <span
                                    aria-hidden="true"
                                    data-inside={inside}
                                    className={cn('absolute h-3 w-3 rounded-full', inside ? 'bg-fg' : 'bg-warning')}
                                    style={{ top }}
                                />
                            )}
                            <span
                                aria-hidden="true"
                                className={cn('text-xs font-semibold', day.isToday ? 'text-fg' : 'text-fg-subtle')}
                            >
                                {day.label}
                            </span>
                        </li>
                    )
                })}
            </ol>
            <div aria-hidden="true" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-muted">
                <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-4 rounded-[3px] bg-subtle" />
                    {t('ui.weekDots.legendBand', { tolerance: Math.round(tolerance * 100) })}
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-fg" />
                    {t('ui.weekDots.legendInside')}
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-warning" />
                    {t('ui.weekDots.legendOutside')}
                </span>
            </div>
        </div>
    )
}
