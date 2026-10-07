'use client'

import toast from 'react-hot-toast'
import { Switch } from './Switch'

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
            {/* Строка настройки — одной карточкой, как группы на остальных экранах. */}
            <div className="flex min-h-14 items-center justify-between gap-4 rounded-card border border-line bg-surface px-4 py-1.5">
                <span className="type-headline text-fg">
                    Синхронизация с Apple Здоровье
                </span>
                <Switch
                    checked={enabled}
                    label="Синхронизация с Apple Здоровье"
                    onChange={handleToggle}
                />
            </div>

            {/* Help link */}
            <button
                type="button"
                className="inline-flex min-h-11 items-center self-start px-1 text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
                Как настроить Apple Health
            </button>
        </div>
    )
}

AppleHealthToggle.displayName = 'AppleHealthToggle'
