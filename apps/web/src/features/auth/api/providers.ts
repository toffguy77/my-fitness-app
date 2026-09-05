/**
 * External sign-in providers.
 *
 * The browser never handles a provider's tokens: it leaves for the provider and
 * comes back to our callback, which either establishes the session or parks the
 * attempt for one of the screens below to finish.
 */

import { apiClient } from '@/shared/utils/api-client'
import type { AuthResponse } from '@/features/auth/types'

export type ProviderName = 'yandex' | 'vk' | 'max'

/** Display names, so a screen never shows a bare slug. */
// i18n-exempt: brand names, the same in every language.
export const providerLabels: Record<string, string> = {
    yandex: 'Яндекс ID', // i18n-exempt: brand name
    vk: 'VK ID',
    max: 'MAX',
}

export function providerLabel(provider: string): string {
    return providerLabels[provider] ?? provider
}

export interface LinkedProvider {
    provider: string
    email?: string
    name?: string
    linked_at: string
    last_login_at?: string
}

export interface LinkedProvidersResponse {
    linked: LinkedProvider[]
    /** Whether a password exists — the only other way back in. */
    has_password: boolean
}

/** The address already has an account; its owner has to claim it. */
export interface NeedsLinkConfirmation {
    result: 'needs_link_confirmation'
    email: string
}

export function needsLinkConfirmation(
    value: AuthResponse | NeedsLinkConfirmation
): value is NeedsLinkConfirmation {
    return (value as NeedsLinkConfirmation).result === 'needs_link_confirmation'
}

export const providersApi = {
    /** Only providers this deployment has credentials for. */
    async list(): Promise<string[]> {
        const data = await apiClient.get<{ providers: string[] }>('/api/v1/auth/providers')
        return data.providers ?? []
    },

    /**
     * Where the sign-in starts. A full page navigation, not fetch: the flow
     * continues at the provider's own site.
     */
    startUrl(provider: string): string {
        return `/api/v1/auth/oauth/${provider}`
    },

    /** Turns the callback's HttpOnly refresh cookie into a session. */
    complete(): Promise<AuthResponse> {
        return apiClient.post<AuthResponse>('/api/v1/auth/refresh', {})
    },

    /** Proves the matching account is the caller's, then links the provider. */
    confirmLink(password: string): Promise<AuthResponse> {
        return apiClient.post<AuthResponse>('/api/v1/auth/oauth/link', { password })
    },

    /** Supplies the address a provider did not return. */
    completeWithEmail(email: string): Promise<AuthResponse | NeedsLinkConfirmation> {
        return apiClient.post<AuthResponse | NeedsLinkConfirmation>('/api/v1/auth/oauth/email', { email })
    },

    linked(): Promise<LinkedProvidersResponse> {
        return apiClient.get<LinkedProvidersResponse>('/api/v1/auth/providers/linked')
    },

    unlink(provider: string): Promise<{ unlinked: boolean }> {
        return apiClient.delete<{ unlinked: boolean }>(`/api/v1/auth/providers/${provider}`)
    },
}
