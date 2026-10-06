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
            <legend className="mb-2 text-sm font-medium text-fg">
                Аудитория
            </legend>
            <div className="flex flex-col gap-2">
                {OPTIONS.map((option) => (
                    <label
                        key={option.value}
                        className={cn(
                            'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors',
                            value === option.value
                                ? 'border-primary bg-primary-soft text-primary'
                                : 'border-line text-fg hover:bg-canvas'
                        )}
                    >
                        <input
                            type="radio"
                            name="audience_scope"
                            value={option.value}
                            checked={value === option.value}
                            onChange={() => onChange(option.value)}
                            className="accent-primary"
                        />
                        {option.label}
                    </label>
                ))}
            </div>
            {value === 'selected' && (
                <div className="mt-2 rounded-md bg-warning-soft px-3 py-2 text-xs text-warning-fg">
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
