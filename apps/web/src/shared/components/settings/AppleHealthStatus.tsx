'use client'

import { Check, Smartphone } from 'lucide-react'
import { cn } from '@/shared/utils/cn'
import { t } from '@/shared/i18n'

export interface AppleHealthStatusProps {
    /** user_settings.apple_health_enabled — его ставит и снимает приложение. */
    connected: boolean
}

/**
 * Apple Здоровье в веб-настройках — только состояние и объяснение.
 *
 * Подключить Здоровье из браузера нельзя: разрешения выдаёт iPhone, данные
 * читает и присылает приложение. Признак apple_health_enabled ставит и снимает
 * приложение, и веб его не пишет: переключатель здесь либо ничего не делал бы,
 * либо отключал бы импорт за спиной у телефона.
 */
export function AppleHealthStatus({ connected }: AppleHealthStatusProps) {
    return (
        <div className="flex flex-col gap-3">
            <div className="flex min-h-14 items-center justify-between gap-4 rounded-card border border-line bg-surface px-4 py-1.5">
                <span className="type-headline text-fg">{t('settings.appleHealth.title')}</span>
                <span
                    data-testid="apple-health-state"
                    className={cn(
                        'inline-flex items-center gap-1.5 text-sm font-medium',
                        connected ? 'text-success-fg' : 'text-fg-muted',
                    )}
                >
                    {connected
                        ? <Check className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                        : <Smartphone className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />}
                    {connected ? t('settings.appleHealth.connected') : t('settings.appleHealth.notConnected')}
                </span>
            </div>

            <p className="px-1 text-sm text-fg-muted">{t('settings.appleHealth.explanation')}</p>
            <p className="px-1 text-sm text-fg-muted">{t('settings.appleHealth.manualWins')}</p>
            {connected && (
                <p className="px-1 text-sm text-fg-subtle">{t('settings.appleHealth.disconnectHint')}</p>
            )}
        </div>
    )
}

AppleHealthStatus.displayName = 'AppleHealthStatus'
