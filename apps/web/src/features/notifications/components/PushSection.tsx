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

export function PushSection() {
    const { state, busy, enable, disable } = usePushSubscription()

    if (state === 'unknown') return null

    return (
        <div className="rounded-2xl bg-white p-4 shadow-sm" data-testid="push-section">
            <p className="mb-1 text-sm font-medium text-gray-500">{t('notifications.push.heading')}</p>

            {state === 'unsupported' && (
                <p className="py-2 text-sm text-gray-500">
                    {t('notifications.push.unsupported')}
                </p>
            )}

            {state === 'needs-install' && (
                <p className="py-2 text-sm text-gray-500">
                    {t('notifications.push.iosHint')}
                </p>
            )}

            {state === 'denied' && (
                <p className="py-2 text-sm text-gray-500">
                    {t('notifications.push.denied')}
                </p>
            )}

            {state === 'available' && (
                <div className="py-2">
                    <p className="text-sm text-gray-500">
                        {t('notifications.push.offer')}
                    </p>
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => void enable()}
                        className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                    >
                        {busy ? t('notifications.push.enabling') : t('notifications.push.enable')}
                    </button>
                </div>
            )}

            {state === 'subscribed' && (
                <div className="flex items-center justify-between py-2">
                    <p className="pr-4 text-sm text-gray-500">
                        {t('notifications.push.enabled')}
                    </p>
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => void disable()}
                        className="shrink-0 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50"
                    >
                        {busy ? t('notifications.push.disabling') : t('notifications.push.disable')}
                    </button>
                </div>
            )}
        </div>
    )
}

PushSection.displayName = 'PushSection'
