import type { ReactNode } from 'react'
import { color as role } from '@burcev/design-tokens'
import { cn } from '@/shared/utils/cn'

export interface ProgressArcProps {
    value: number
    max: number
    /** Цвет дуги; по умолчанию — бренд. */
    color?: string
    /** Подпись для экранного диктора: что и сколько. */
    label: string
    /** Содержимое под дугой: обычно остаток крупной цифрой. */
    children?: ReactNode
    className?: string
}

const W = 280
const H = 150
const R = 120
const STROKE = 12

/**
 * Полукруглая шкала — главный показатель дня (калории).
 *
 * Полукруг, а не кольцо: под дугой остаётся место для крупного числа и
 * подписи, а сам экран не превращается в набор одинаковых колец.
 * Длина дуги задана через `pathLength=100`, поэтому заполнение — просто процент.
 */
export function ProgressArc({ value, max, color = role.primary, label, children, className }: ProgressArcProps) {
    const percent = max > 0 ? Math.min(Math.max(value / max, 0), 1) * 100 : 0
    const d = `M ${(W - 2 * R) / 2} ${H - STROKE / 2 - 4} A ${R} ${R} 0 0 1 ${W - (W - 2 * R) / 2} ${H - STROKE / 2 - 4}`
    return (
        <div
            className={cn('relative mx-auto w-full max-w-[280px]', className)}
            role="img"
            aria-label={label}
        >
            <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" aria-hidden="true">
                <path d={d} fill="none" stroke={role.track} strokeWidth={STROKE} strokeLinecap="round" />
                {percent > 0 && (
                    <path
                        d={d}
                        fill="none"
                        stroke={color}
                        strokeWidth={STROKE}
                        strokeLinecap="round"
                        pathLength={100}
                        strokeDasharray={`${percent} 100`}
                        className="transition-[stroke-dasharray] duration-300 ease-standard"
                    />
                )}
            </svg>
            <div className="absolute inset-x-0 bottom-1 flex flex-col items-center gap-0.5 text-center">
                {children}
            </div>
        </div>
    )
}
