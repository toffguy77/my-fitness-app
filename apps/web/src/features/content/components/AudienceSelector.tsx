'use client'

import { cn } from '@/shared/utils/cn'
import type { AudienceScope } from '@/features/content/types'

// ============================================================================
// Types
// ============================================================================

interface AudienceSelectorProps {
    value: AudienceScope
    onChange: (scope: AudienceScope) => void
    clientIds: number[]
    onClientIdsChange: (ids: number[]) => void
}

// ============================================================================
// Constants
// ============================================================================

const OPTIONS: { value: AudienceScope; label: string }[] = [
    { value: 'all', label: 'Все пользователи' },
    { value: 'my_clients', label: 'Мои клиенты' },
    { value: 'selected', label: 'Выборочно' },
]

// ============================================================================
// Component
// ============================================================================

export function AudienceSelector({
    value,
    onChange,
    clientIds,
    onClientIdsChange,
}: AudienceSelectorProps) {
    return (
        <fieldset>
            <legend className="mb-2 text-sm font-medium text-gray-700">
                Аудитория
            </legend>
            <div className="flex flex-col gap-2">
                {OPTIONS.map((option) => (
                    <label
                        key={option.value}
                        className={cn(
                            'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors',
                            value === option.value
                                ? 'border-blue-500 bg-blue-50 text-blue-700'
                                : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                        )}
                    >
                        <input
                            type="radio"
                            name="audience_scope"
                            value={option.value}
                            checked={value === option.value}
                            onChange={() => onChange(option.value)}
                            className="accent-blue-600"
                        />
                        {option.label}
                    </label>
                ))}
            </div>
            {value === 'selected' && (
                <div className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    <p>Выбор конкретных клиентов будет добавлен позже</p>
                    {clientIds.length > 0 && (
                        <p className="mt-1">
                            Выбрано клиентов: {clientIds.length}{' '}
                            <button
                                type="button"
                                onClick={() => onClientIdsChange([])}
                                className="ml-1 underline hover:no-underline"
                            >
                                Очистить
                            </button>
                        </p>
                    )}
                </div>
            )}
        </fieldset>
    )
}
