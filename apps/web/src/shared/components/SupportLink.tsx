'use client'

/**
 * "Ask in Telegram" — the only way to reach a person before registering.
 *
 * Until this existed, somebody with a question on the landing page or halfway
 * through the wizard had an address in the footer and nothing else, which is
 * exactly where the funnel was losing them.
 */

import { leadToken } from '@/features/onboarding/api/guest'

export function SupportLink({ className }: { className?: string }) {
    // Read here rather than at module load: Next inlines the value either way,
    // and at module load it is fixed before anything can vary it.
    const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT

    // No bot configured for this deployment: better no link than a dead one.
    if (!botUsername) return null

    // The deep-link payload carries their saved attempt, so whoever answers can
    // see where they got stuck instead of asking them to explain.
    const token = leadToken()
    const href = `https://t.me/${botUsername}${token ? `?start=${encodeURIComponent(token)}` : ''}`

    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="support-link"
            className={className ?? 'text-sm text-blue-600 hover:underline'}
        >
            Задать вопрос в Telegram
        </a>
    )
}
