'use client'

import { cn } from '@/shared/utils/cn'

export interface LanguageSelectorProps {
    value: 'ru' | 'en'
    onChange: (value: 'ru' | 'en') => void
    disabled?: boolean
}

const languages = [
    { value: 'ru' as const, label: 'Русский', indicatorColor: 'bg-green-500' },
    { value: 'en' as const, label: 'English', indicatorColor: 'bg-red-500' },
]

export function LanguageSelector({ value, onChange, disabled }: LanguageSelectorProps) {
    return (
        <div className="w-full">
            <h3 className="mb-3 text-sm font-bold text-gray-900">Язык интерфейса</h3>
            <div className="flex flex-col gap-2">
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
                                'flex w-full items-center rounded-xl px-4 py-3 text-left font-medium transition-colors',
                                'disabled:pointer-events-none disabled:opacity-50',
                                isActive
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-100 text-gray-700'
                            )}
                        >
                            <span
                                className={cn('mr-3 h-3 w-3 rounded-sm', lang.indicatorColor)}
                                aria-hidden="true"
                            />
                            {lang.label}
                        </button>
                    )
                })}
            </div>
        </div>
    )
}

LanguageSelector.displayName = 'LanguageSelector'
