import { cn } from '@/shared/utils/cn'

export interface ProgressBarProps {
    value: number
    max: number
    /** Цвет заполнения — роль дизайн-системы (`var(--ds-…)` или `color.*`). */
    color: string
    /** Толщина: 3 — в плотных плитках, 4 — по умолчанию, 8 — главный показатель. */
    thickness?: 3 | 4 | 6 | 8
    /** Подпись для экранного диктора. Без неё полоса считается украшением. */
    label?: string
    className?: string
}

/**
 * Полоса выполнения нормы.
 *
 * Заполнение не перекрашивается при превышении: цвет опознаёт показатель
 * (openspec macro-colour-system), превышение сообщается рядом — числом и словом.
 */
export function ProgressBar({ value, max, color, thickness = 4, label, className }: ProgressBarProps) {
    const percent = max > 0 ? Math.min(Math.max(value / max, 0), 1) * 100 : 0
    return (
        <div
            className={cn('w-full overflow-hidden rounded-full bg-track', className)}
            style={{ height: thickness }}
            {...(label
                ? { role: 'progressbar', 'aria-label': label, 'aria-valuenow': Math.round(value), 'aria-valuemin': 0, 'aria-valuemax': Math.round(max) }
                : { 'aria-hidden': true })}
        >
            <div
                className="h-full rounded-full transition-[width] duration-300 ease-standard"
                style={{ width: `${percent}%`, backgroundColor: color }}
            />
        </div>
    )
}
