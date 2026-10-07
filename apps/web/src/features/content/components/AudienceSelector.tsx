'use client'

import { Info } from 'lucide-react'
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
    // Выбор — строками списка с отметкой; выбранная строка — инверсия
    // чернилами, как выбранный чип или день (терракота — только главному
    // действию). Нативная радиокнопка остаётся для клавиатуры и диктора.
    return (
        <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-fg-muted">
                Аудитория
            </legend>
            <div className="flex flex-col gap-2">
                {OPTIONS.map((option) => {
                    const selected = value === option.value
                    return (
                        <label
                            key={option.value}
                            className={cn(
                                'flex min-h-12 cursor-pointer items-center gap-3 rounded-tile border px-4 text-[15px] transition-colors duration-150',
                                'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus has-[:focus-visible]:ring-offset-2',
                                selected
                                    ? 'border-fg bg-fg font-medium text-fg-inverse'
                                    : 'border-line bg-surface text-fg hover:bg-subtle'
                            )}
                        >
                            <input
                                type="radio"
                                name="audience_scope"
                                value={option.value}
                                checked={selected}
                                onChange={() => onChange(option.value)}
                                className="sr-only"
                            />
                            <span
                                className={cn(
                                    'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2',
                                    selected ? 'border-fg-inverse' : 'border-line-strong'
                                )}
                                aria-hidden="true"
                            >
                                {selected && <span className="h-2 w-2 rounded-full bg-fg-inverse" />}
                            </span>
                            {option.label}
                        </label>
                    )
                })}
            </div>
            {value === 'selected' && (
                <div className="mt-2 flex items-start gap-2 rounded-tile bg-info-soft px-3 py-2.5 text-sm text-info-fg">
                    <Info className="mt-0.5 h-4 w-4 flex-shrink-0" strokeWidth={1.8} aria-hidden="true" />
                    <div>
                        <p>Выбор конкретных клиентов будет добавлен позже</p>
                        {clientIds.length > 0 && (
                            <p className="mt-1 tabular-nums">
                                Выбрано клиентов: {clientIds.length}{' '}
                                <button
                                    type="button"
                                    onClick={() => onClientIdsChange([])}
                                    className="ml-1 font-semibold underline hover:no-underline"
                                >
                                    Очистить
                                </button>
                            </p>
                        )}
                    </div>
                </div>
            )}
        </fieldset>
    )
}
