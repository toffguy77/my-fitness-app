'use client'

import { cn } from '@/shared/utils/cn'

export interface KBZHUProgressProps {
    label: string
    value: number
    target: number
    compact?: boolean
}

/**
 * Полоса выполнения нормы для рабочего экрана куратора. В отличие от экранов
 * клиента, здесь цвет оценивает: куратору нужно с одного взгляда отличить день
 * в коридоре нормы (`success`) от дня мимо неё (`warning`) и от провала
 * (`danger`).
 */
function getProgressColor(percentage: number): string {
    if (percentage >= 80 && percentage <= 120) return 'bg-success'
    if ((percentage >= 50 && percentage < 80) || (percentage > 120 && percentage <= 150)) return 'bg-warning'
    return 'bg-danger'
}

export function KBZHUProgress({ label, value, target, compact = false }: KBZHUProgressProps) {
    const percentage = target > 0 ? Math.round((value / target) * 100) : 0
    const clampedWidth = Math.min(percentage, 100)
    const colorClass = getProgressColor(percentage)

    return (
        <div className={cn('w-full', compact ? 'space-y-0.5' : 'space-y-1')}>
            <div className={cn(
                'flex items-center justify-between',
                compact ? 'text-xs' : 'text-sm'
            )}>
                <span className="text-fg-muted">{label}</span>
                <span className="font-medium tabular-nums text-fg">
                    {Math.round(value)} / {Math.round(target)}{' '}
                    <span className="text-fg-subtle">({percentage}%)</span>
                </span>
            </div>
            <div className={cn(
                'w-full overflow-hidden rounded-full bg-track',
                compact ? 'h-1.5' : 'h-2'
            )}>
                <div
                    className={cn('h-full rounded-full transition-[width] duration-300 ease-standard', colorClass)}
                    style={{ width: `${clampedWidth}%` }}
                />
            </div>
        </div>
    )
}
