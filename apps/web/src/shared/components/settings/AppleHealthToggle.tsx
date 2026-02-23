'use client'

import toast from 'react-hot-toast'
import { cn } from '@/shared/utils/cn'

export interface AppleHealthToggleProps {
    enabled: boolean
    onChange: (enabled: boolean) => void
}

export function AppleHealthToggle({ enabled, onChange }: AppleHealthToggleProps) {
    function handleToggle() {
        if (!enabled) {
            // Stub: revert immediately and show toast
            onChange(false)
            toast('Скоро будет доступно')
            return
        }
        onChange(false)
    }

    return (
        <div className="flex flex-col gap-3">
            {/* Main row */}
            <div className="flex items-center justify-between">
                <span className="font-medium text-gray-900">
                    Синхронизация с Apple Здоровье
                </span>

                <div className="flex items-center gap-2">
                    {/* Toggle switch */}
                    <button
                        type="button"
                        role="switch"
                        aria-checked={enabled}
                        aria-label="Синхронизация с Apple Здоровье"
                        onClick={handleToggle}
                        className={cn(
                            'relative inline-flex h-6 w-12 shrink-0 cursor-pointer items-center rounded-full transition-colors',
                            enabled ? 'bg-violet-500' : 'bg-gray-300'
                        )}
                    >
                        <span
                            className={cn(
                                'inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform',
                                enabled ? 'translate-x-6' : 'translate-x-0.5'
                            )}
                        />
                    </button>

                    {/* Chevron icon */}
                    <svg
                        className="h-5 w-5 text-gray-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                        aria-hidden="true"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                </div>
            </div>

            {/* Help link */}
            <button
                type="button"
                className="self-start text-sm text-violet-500 transition-colors hover:text-violet-600"
            >
                Как настроить Apple Health
            </button>
        </div>
    )
}

AppleHealthToggle.displayName = 'AppleHealthToggle'
