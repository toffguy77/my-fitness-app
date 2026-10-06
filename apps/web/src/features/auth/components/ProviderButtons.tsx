'use client'

/**
 * Sign-in through an external provider.
 *
 * The list comes from the server: a deployment without credentials for a
 * provider must not show a button that cannot work.
 */

import { useEffect, useState } from 'react'
import { providersApi, providerLabel } from '@/features/auth/api/providers'
import { t } from '@/shared/i18n'
import { buttonBase, buttonSizes, buttonVariants } from '@/shared/components/ui/Button'
import { cn } from '@/shared/utils/cn'

export function ProviderButtons({ mode }: { mode: 'login' | 'register' }) {
    const [providers, setProviders] = useState<string[]>([])

    useEffect(() => {
        providersApi.list().then(setProviders).catch(() => setProviders([]))
    }, [])

    if (providers.length === 0) return null

    return (
        <div className="mt-6">
            <div className="flex items-center gap-3" aria-hidden="true">
                <span className="h-px flex-1 bg-line" />
                <span className="type-caption text-fg-subtle">
                    {mode === 'register' ? t('auth.orRegisterWith') : t('auth.orSignInWith')}
                </span>
                <span className="h-px flex-1 bg-line" />
            </div>

            <div className="mt-4 space-y-3">
                {providers.map((provider) => (
                    <a
                        key={provider}
                        // A full navigation, not fetch: the flow continues at
                        // the provider's own site.
                        href={providersApi.startUrl(provider)}
                        data-testid={`oauth-${provider}`}
                        className={cn(buttonBase, buttonVariants.secondary, buttonSizes.lg, 'w-full')}
                    >
                        {providerLabel(provider)}
                    </a>
                ))}
            </div>
        </div>
    )
}
