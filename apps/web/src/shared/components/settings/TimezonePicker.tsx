'use client'

import { useState, useEffect, useRef, useId } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/shared/utils/cn'
import { fieldClass, fieldLabelClass } from '../forms/fieldStyles'

export interface TimezoneSelectorProps {
    value: string
    onChange: (value: string) => void
    disabled?: boolean
}

const timezones = [
    { value: 'Europe/Kaliningrad', label: 'Калининград (UTC+2)' },
    { value: 'Europe/Moscow', label: 'Москва (UTC+3)' },
    { value: 'Europe/Samara', label: 'Самара (UTC+4)' },
    { value: 'Asia/Yekaterinburg', label: 'Екатеринбург (UTC+5)' },
    { value: 'Asia/Omsk', label: 'Омск (UTC+6)' },
    { value: 'Asia/Krasnoyarsk', label: 'Красноярск (UTC+7)' },
    { value: 'Asia/Irkutsk', label: 'Иркутск (UTC+8)' },
    { value: 'Asia/Yakutsk', label: 'Якутск (UTC+9)' },
    { value: 'Asia/Vladivostok', label: 'Владивосток (UTC+10)' },
    { value: 'Asia/Magadan', label: 'Магадан (UTC+11)' },
    { value: 'Asia/Kamchatka', label: 'Камчатка (UTC+12)' },
]

export function TimezoneSelector({ value, onChange, disabled }: TimezoneSelectorProps) {
    const [isOpen, setIsOpen] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)
    const labelId = useId()
    const valueId = useId()

    const selectedLabel = timezones.find((tz) => tz.value === value)?.label ?? 'Выберите часовой пояс'

    useEffect(() => {
        if (!isOpen) return

        function handleClickOutside(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false)
            }
        }

        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [isOpen])

    return (
        <div className="w-full">
            <p id={labelId} className={fieldLabelClass}>Часовой пояс</p>
            <div className="relative" ref={containerRef}>
                <button
                    type="button"
                    disabled={disabled}
                    onClick={() => setIsOpen((o) => !o)}
                    aria-expanded={isOpen}
                    aria-labelledby={`${labelId} ${valueId}`}
                    className={cn(fieldClass, 'items-center justify-between gap-2 text-left')}
                >
                    <span id={valueId} className="truncate">{selectedLabel}</span>
                    <ChevronDown
                        className={cn(
                            'h-5 w-5 shrink-0 text-fg-subtle transition-transform',
                            isOpen && 'rotate-180'
                        )}
                        strokeWidth={1.8}
                        aria-hidden="true"
                    />
                </button>

                {/* Меню лежит над экраном — единственное здесь, чему положена тень. */}
                {isOpen && (
                    <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-64 overflow-y-auto rounded-tile border border-line bg-surface py-1 shadow-overlay">
                        {timezones.map((tz) => {
                            const isActive = value === tz.value
                            return (
                                <button
                                    key={tz.value}
                                    type="button"
                                    onClick={() => {
                                        onChange(tz.value)
                                        setIsOpen(false)
                                    }}
                                    aria-pressed={isActive}
                                    className={cn(
                                        'flex min-h-11 w-full items-center justify-between gap-3 px-4 text-left text-base tabular-nums transition-colors',
                                        'hover:bg-subtle focus-visible:bg-subtle focus-visible:outline-none',
                                        isActive ? 'font-semibold text-fg' : 'text-fg'
                                    )}
                                >
                                    {tz.label}
                                    {isActive && (
                                        <Check className="h-5 w-5 shrink-0 text-fg" strokeWidth={2} aria-hidden="true" />
                                    )}
                                </button>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}

TimezoneSelector.displayName = 'TimezoneSelector'
