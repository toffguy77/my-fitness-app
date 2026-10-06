'use client'

import { useId } from 'react'
import { cn } from '@/shared/utils/cn'

export interface UnitSelectorProps {
    value: 'metric' | 'imperial'
    onChange: (value: 'metric' | 'imperial') => void
    disabled?: boolean
}

const units = [
    { value: 'metric' as const, label: 'Кг, см' },
    { value: 'imperial' as const, label: 'Фунты, дюймы' },
]

/** Два варианта — сегменты; выбранный — инверсией чернилами, не брендом. */
export function UnitSelector({ value, onChange, disabled }: UnitSelectorProps) {
    const headingId = useId()
    return (
        <div className="w-full">
            <p id={headingId} className="mb-1.5 text-sm font-medium text-fg-muted">Единицы измерения</p>
            <div
                role="group"
                aria-labelledby={headingId}
                className="grid grid-cols-2 gap-1 rounded-full border border-line bg-surface p-1"
            >
                {units.map((unit) => {
                    const isActive = value === unit.value
                    return (
                        <button
                            key={unit.value}
                            type="button"
                            disabled={disabled}
                            onClick={() => onChange(unit.value)}
                            aria-pressed={isActive}
                            className={cn(
                                'flex h-11 min-w-0 items-center justify-center rounded-full px-3 text-sm font-semibold transition-colors',
                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                                'disabled:pointer-events-none disabled:opacity-50',
                                isActive ? 'bg-fg text-fg-inverse' : 'text-fg-muted hover:text-fg'
                            )}
                        >
                            <span className="truncate">{unit.label}</span>
                        </button>
                    )
                })}
            </div>
        </div>
    )
}

UnitSelector.displayName = 'UnitSelector'
