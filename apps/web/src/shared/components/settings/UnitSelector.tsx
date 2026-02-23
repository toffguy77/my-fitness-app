'use client'

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

export function UnitSelector({ value, onChange, disabled }: UnitSelectorProps) {
    return (
        <div className="w-full">
            <h3 className="mb-3 text-sm font-bold text-gray-900">Единицы измерения</h3>
            <div className="flex flex-col gap-2">
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
                                'flex w-full items-center rounded-xl px-4 py-3 text-left font-medium transition-colors',
                                'disabled:pointer-events-none disabled:opacity-50',
                                isActive
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-100 text-gray-700'
                            )}
                        >
                            {unit.label}
                        </button>
                    )
                })}
            </div>
        </div>
    )
}

UnitSelector.displayName = 'UnitSelector'
