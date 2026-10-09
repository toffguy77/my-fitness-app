'use client'

/**
 * Turning push on, for this browser.
 *
 * The browser's permission prompt is never fired on load. A prompt shown before
 * somebody knows what the product does is the fastest route to a permanent
 * "no": the browser remembers a refusal and there is no second chance to ask.
 * So the explanation comes first, and the prompt follows a click.
 */

import { usePushSubscription } from '../hooks/usePushSubscription'
import { t } from '@/shared/i18n'
import { Button } from '@/shared/components/ui/Button'

export function PushSection() {
    const { state, busy, error, enable, disable } = usePushSubscription()

    if (state === 'unknown') return null

    return (
        <div className="rounded-card border border-line bg-surface p-5" data-testid="push-section">
            <h2 className="mb-1 type-title-3 text-fg">{t('notifications.push.heading')}</h2>

            {error && <p className="py-2 text-sm text-danger-fg" role="alert">{error}</p>}

            {state === 'unsupported' && (
                <p className="py-2 text-sm text-fg-muted">
                    {t('notifications.push.unsupported')}
                </p>
            )}

            {state === 'needs-install' && (
                <p className="py-2 text-sm text-fg-muted">
                    {t('notifications.push.iosHint')}
                </p>
            )}

            {state === 'denied' && (
                <p className="py-2 text-sm text-fg-muted">
                    {t('notifications.push.denied')}
                </p>
            )}

            {state === 'available' && (
                <div className="py-2">
                    <p className="text-sm text-fg-muted">
                        {t('notifications.push.offer')}
                    </p>
                    <Button
                        type="button"
                        variant="primary"
                        disabled={busy}
                        onClick={() => void enable()}
                        className="mt-3"
                    >
                        {busy ? t('notifications.push.enabling') : t('notifications.push.enable')}
                    </Button>
                </div>
            )}

            {state === 'subscribed' && (
                <div className="flex items-center justify-between py-2">
                    <p className="pr-4 text-sm text-fg-muted">
                        {t('notifications.push.enabled')}
                    </p>
                    <Button
                        type="button"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => void disable()}
                        className="-mr-3 shrink-0 text-fg-muted"
                    >
                        {busy ? t('notifications.push.disabling') : t('notifications.push.disable')}
                    </Button>
                </div>
            )}
        </div>
    )
}

PushSection.displayName = 'PushSection'
