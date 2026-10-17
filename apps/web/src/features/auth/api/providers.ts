/**
 * External sign-in providers.
 *
 * The browser never handles a provider's tokens: it leaves for the provider and
 * comes back to our callback, which either establishes the session or parks the
 * attempt for one of the screens below to finish.
 */

import { apiClient } from '@/shared/utils/api-client'
import type { AuthResponse, ConsentState } from '@/features/auth/types'

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

/**
 * The address is new: the account is created on the consents screen, from the
 * same pending attempt, and not before.
 */
export interface NeedsConsents {
    result: 'needs_consents'
}

export function needsConsents(value: object): value is NeedsConsents {
    return (value as NeedsConsents).result === 'needs_consents'
}

export function needsLinkConfirmation(
    value: AuthResponse | NeedsLinkConfirmation | NeedsConsents
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
        return apiClient.post<AuthResponse | undefined>('/api/v1/auth/refresh', {}).then((response) => {
            // 204: the callback's cookie never arrived, so there is no session.
            if (!response) throw new Error('No session to complete')
            return response
        })
    },

    /** Proves the matching account is the caller's, then links the provider. */
    confirmLink(password: string): Promise<AuthResponse> {
        return apiClient.post<AuthResponse>('/api/v1/auth/oauth/link', { password })
    },

    /** Supplies the address a provider did not return. */
    completeWithEmail(email: string): Promise<AuthResponse | NeedsLinkConfirmation | NeedsConsents> {
        return apiClient.post<AuthResponse | NeedsLinkConfirmation | NeedsConsents>('/api/v1/auth/oauth/email', {
            email,
        })
    },

    /**
     * Creates the account a provider sign-in was waiting on, with the consents
     * the registration form asks for. The pending sign-in is the `oauth_pending`
     * cookie on /api/v1/auth, which the browser attaches by itself.
     *
     * Like completeWithEmail, it can answer that the address has meanwhile
     * become an existing account's, to be claimed with its password.
     */
    completeWithConsents(consents: ConsentState): Promise<AuthResponse | NeedsLinkConfirmation> {
        return apiClient.post<AuthResponse | NeedsLinkConfirmation>('/api/v1/auth/oauth/consents', { consents })
    },

    linked(): Promise<LinkedProvidersResponse> {
        return apiClient.get<LinkedProvidersResponse>('/api/v1/auth/providers/linked')
    },

    unlink(provider: string): Promise<{ unlinked: boolean }> {
        return apiClient.delete<{ unlinked: boolean }>(`/api/v1/auth/providers/${provider}`)
    },
}
