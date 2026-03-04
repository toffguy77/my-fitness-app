'use client'

import { useState, useEffect, useRef } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/shared/utils/cn'

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
            <h3 className="mb-3 text-sm font-bold text-gray-900">Часовой пояс</h3>
            <div className="relative" ref={containerRef}>
                <button
                    type="button"
                    disabled={disabled}
                    onClick={() => setIsOpen((o) => !o)}
                    className={cn(
                        'flex w-full items-center justify-between rounded-xl px-4 py-3 text-left font-medium transition-colors',
                        'bg-gray-100 text-gray-700',
                        'disabled:pointer-events-none disabled:opacity-50'
                    )}
                >
                    {selectedLabel}
                    <ChevronDown
                        className={cn(
                            'h-4 w-4 text-gray-500 transition-transform',
                            isOpen && 'rotate-180'
                        )}
                    />
                </button>

                {isOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 z-50 max-h-64 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg">
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
                                    className={cn(
                                        'flex w-full items-center px-4 py-3 text-left text-sm font-medium transition-colors',
                                        isActive
                                            ? 'bg-blue-600 text-white'
                                            : 'text-gray-700 hover:bg-gray-100'
                                    )}
                                >
                                    {tz.label}
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
