'use client'

import { cn } from '@/shared/utils/cn'

export interface SwitchProps {
    checked: boolean
    /** Что переключается. Переключатель без имени не прочитать диктором и не найти в тесте. */
    label: string
    onChange: (value: boolean) => void
    disabled?: boolean
    className?: string
}

/**
 * Переключатель «вкл/выкл» для строки настроек.
 *
 * Видимая дорожка 28×48, а область нажатия — 44 px по высоте: строка списка
 * нажимается пальцем, не курсором. Включено — бренд (`bg-primary`), выключено —
 * незаполненная дорожка (`bg-track`), как у полос и дуг.
 */
export function Switch({ checked, label, onChange, disabled, className }: SwitchProps) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className={cn(
                'group inline-flex h-11 shrink-0 items-center rounded-full touch-manipulation',
                'focus-visible:outline-none',
                'disabled:cursor-not-allowed disabled:opacity-50',
                className,
            )}
        >
            <span
                aria-hidden="true"
                className={cn(
                    'relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-200 ease-standard',
                    'group-focus-visible:ring-2 group-focus-visible:ring-focus group-focus-visible:ring-offset-2',
                    checked ? 'bg-primary' : 'bg-track',
                )}
            >
                <span
                    className={cn(
                        'inline-block h-[22px] w-[22px] rounded-full bg-surface transition-transform duration-200 ease-standard',
                        checked ? 'translate-x-[23px]' : 'translate-x-[3px]',
                    )}
                />
            </span>
        </button>
    )
}

Switch.displayName = 'Switch'
