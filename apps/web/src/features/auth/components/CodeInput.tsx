'use client'

import { useRef, KeyboardEvent, ClipboardEvent } from 'react'
import { cn } from '@/shared/utils/cn'

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
        <div className="flex justify-center gap-2">
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
                        'h-12 w-10 rounded-lg border text-center text-xl font-bold transition-colors',
                        'focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20',
                        'disabled:opacity-50',
                        error
                            ? 'border-red-300 bg-red-50'
                            : 'border-gray-300 bg-white'
                    )}
                    aria-label={`Цифра ${i + 1}`}
                />
            ))}
        </div>
    )
}
