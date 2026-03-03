'use client'

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
    return (
        <div className="w-full">
            <h3 className="mb-3 text-sm font-bold text-gray-900">Часовой пояс</h3>
            <div className="flex flex-col gap-2">
                {timezones.map((tz) => {
                    const isActive = value === tz.value
                    return (
                        <button
                            key={tz.value}
                            type="button"
                            disabled={disabled}
                            onClick={() => onChange(tz.value)}
                            aria-pressed={isActive}
                            className={cn(
                                'flex w-full items-center rounded-xl px-4 py-3 text-left font-medium transition-colors',
                                'disabled:pointer-events-none disabled:opacity-50',
                                isActive
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-100 text-gray-700'
                            )}
                        >
                            {tz.label}
                        </button>
                    )
                })}
            </div>
        </div>
    )
}

TimezoneSelector.displayName = 'TimezoneSelector'
