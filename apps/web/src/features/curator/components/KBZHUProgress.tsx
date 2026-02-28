'use client'

import { cn } from '@/shared/utils/cn'

export interface KBZHUProgressProps {
    label: string
    value: number
    target: number
    compact?: boolean
}

function getProgressColor(percentage: number): string {
    if (percentage >= 80 && percentage <= 120) return 'bg-green-500'
    if ((percentage >= 50 && percentage < 80) || (percentage > 120 && percentage <= 150)) return 'bg-yellow-500'
    return 'bg-red-500'
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
                <span className="text-gray-600">{label}</span>
                <span className="text-gray-900 font-medium">
                    {Math.round(value)} / {Math.round(target)}{' '}
                    <span className="text-gray-400">({percentage}%)</span>
                </span>
            </div>
            <div className={cn(
                'w-full rounded-full bg-gray-200',
                compact ? 'h-1.5' : 'h-2'
            )}>
                <div
                    className={cn('h-full rounded-full transition-all', colorClass)}
                    style={{ width: `${clampedWidth}%` }}
                />
            </div>
        </div>
    )
}
