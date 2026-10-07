'use client'

import { useRef, KeyboardEvent, ClipboardEvent } from 'react'
import { cn } from '@/shared/utils/cn'
import { t } from '@/shared/i18n'

interface CodeInputProps {
    value: string[]
    onChange: (value: string[]) => void
    disabled?: boolean
    error?: boolean
}

export function CodeInput({ value, onChange, disabled, error }: CodeInputProps) {
    const inputRefs = useRef<(HTMLInputElement | null)[]>([])

    function handleChange(index: number, digit: string) {
        if (!/^\d?$/.test(digit)) return
        const next = [...value]
        next[index] = digit
        onChange(next)
        if (digit && index < 5) {
            inputRefs.current[index + 1]?.focus()
        }
    }

    function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
        if (e.key === 'Backspace' && !value[index] && index > 0) {
            inputRefs.current[index - 1]?.focus()
        }
    }

    function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
        e.preventDefault()
        const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
        if (!digits) return
        const next = [...value]
        for (let i = 0; i < 6; i++) {
            next[i] = digits[i] || ''
        }
        onChange(next)
        const focusIndex = Math.min(digits.length, 5)
        inputRefs.current[focusIndex]?.focus()
    }

    return (
        <div className="flex justify-center gap-1.5 sm:gap-2">
            {Array.from({ length: 6 }, (_, i) => (
                <input
                    key={i}
                    ref={(el) => { inputRefs.current[i] = el }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={value[i] || ''}
                    disabled={disabled}
                    onChange={(e) => handleChange(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    onPaste={handlePaste}
                    className={cn(
                        'h-14 w-10 sm:w-11 rounded-field border text-center text-2xl font-semibold tabular-nums text-fg transition-colors',
                        'focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-focus/30',
                        'disabled:opacity-50',
                        error
                            ? 'border-danger bg-danger-soft'
                            : 'border-line bg-surface'
                    )}
                    aria-label={t('auth.codeDigit', { position: i + 1 })}
                    aria-invalid={error || undefined}
                />
            ))}
        </div>
    )
}
