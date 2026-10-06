'use client'

import { useId } from 'react'
import { cn } from '@/shared/utils/cn'

export interface LanguageSelectorProps {
    value: 'ru' | 'en'
    onChange: (value: 'ru' | 'en') => void
    disabled?: boolean
}

const languages = [
    { value: 'ru' as const, label: 'Русский' },
    { value: 'en' as const, label: 'English' },
]

/** Два варианта — сегменты; выбранный — инверсией чернилами, не брендом. */
export function LanguageSelector({ value, onChange, disabled }: LanguageSelectorProps) {
    const headingId = useId()
    return (
        <div className="w-full">
            <p id={headingId} className="mb-1.5 text-sm font-medium text-fg-muted">Язык интерфейса</p>
            <div
                role="group"
                aria-labelledby={headingId}
                className="grid grid-cols-2 gap-1 rounded-full border border-line bg-surface p-1"
            >
                {languages.map((lang) => {
                    const isActive = value === lang.value
                    return (
                        <button
                            key={lang.value}
                            type="button"
                            disabled={disabled}
                            onClick={() => onChange(lang.value)}
                            aria-pressed={isActive}
                            className={cn(
                                'flex h-11 min-w-0 items-center justify-center rounded-full px-3 text-sm font-semibold transition-colors',
                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                                'disabled:pointer-events-none disabled:opacity-50',
                                isActive ? 'bg-fg text-fg-inverse' : 'text-fg-muted hover:text-fg'
                            )}
                        >
                            <span className="truncate">{lang.label}</span>
                        </button>
                    )
                })}
            </div>
        </div>
    )
}

LanguageSelector.displayName = 'LanguageSelector'
