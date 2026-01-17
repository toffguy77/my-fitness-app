/**
 * FatSecret OAuth 2.0 Authentication Manager
 *
 * Manages OAuth 2.0 authentication tokens for FatSecret API with automatic refresh
 * and concurrent request handling.
 *
 * @see https://platform.fatsecret.com/api/Default.aspx?screen=rapiauth2
 */

import { logger } from '@/utils/logger'
import type { FatSecretConfiguration } from '@/config/fatsecret'
import { trackTokenRefresh } from './fatsecret-metrics'

/**
 * OAuth 2.0 access token response from FatSecret
 */
export interface FatSecretAuthToken {
    /** Bearer token for API authentication */
    access_token: string
    /** Token type (always "Bearer" for OAuth 2.0) */
    token_type: string
    /** Token lifetime in seconds */
    expires_in: number
    /** Calculated expiration timestamp (Date.now() + expires_in - buffer) */
    expires_at: number
}

/**
 * Internal token cache structure
 */
interface TokenCache {
    /** Currently cached token (null if not yet fetched) */
    token: FatSecretAuthToken | null
    /** Promise for ongoing token refresh (null if no refresh in progress) */
    refreshPromise: Promise<FatSecretAuthToken> | null
}

/**
 * FatSecret OAuth 2.0 Authentication Manager
 *
 * Handles token fetching, caching, and automatic refresh with 1-minute buffer.
 * Ensures concurrent requests share the same token refresh operation.
 *
 * @example
 * ```typescript
 * const authManager = new FatSecretAuthManager(config)
 * const token = await authManager.getToken()
 * // Use token in API requests
 * ```
 */
export class FatSecretAuthManager {
    private cache: TokenCache = { token: null, refreshPromise: null }
    private config: FatSecretConfiguration

    /**
     * Create a new FatSecret authentication manager
     *
     * @param config - FatSecret API configuration with credentials
     */
    constructor(config: FatSecretConfiguration) {
        this.config = config
    }

    /**
     * Get a valid access token, refreshing if necessary
     *
     * This method ensures that:
     * - Cached tokens are returned if still valid
     * - Concurrent requests wait for the same refresh operation
     * - Tokens are refreshed with 1-minute buffer before expiration
     *
     * @returns Valid access token string
     * @throws Error if authentication fails
     */
    async getToken(): Promise<string> {
        // Return cached token if valid
        if (this.cache.token && !this.isTokenExpired(this.cache.token)) {
            logger.debug('Using cached FatSecret token', {
                expiresAt: new Date(this.cache.token.expires_at).toISOString(),
                context: 'fatsecret-auth'
            })
            return this.cache.token.access_token
        }

        // If refresh is in progress, wait for it
        if (this.cache.refreshPromise) {
            logger.debug('Waiting for ongoing token refresh', {
                context: 'fatsecret-auth'
            })
            const token = await this.cache.refreshPromise
            return token.access_token
        }

        // Start new refresh
        logger.info('Starting FatSecret token refresh', {
            context: 'fatsecret-auth'
        })
        this.cache.refreshPromise = this.fetchNewToken()

        try {
            const token = await this.cache.refreshPromise
            this.cache.token = token
            logger.info('FatSecret token refreshed successfully', {
                expiresAt: new Date(token.expires_at).toISOString(),
                expiresIn: token.expires_in,
                context: 'fatsecret-auth'
            })
            trackTokenRefresh(true)
            return token.access_token
        } catch (error) {
            logger.error('FatSecret token refresh failed', {
                error: error instanceof Error ? error.message : String(error),
                context: 'fatsecret-auth'
            })
            trackTokenRefresh(false)
            throw error
        } finally {
            this.cache.refreshPromise = null
        }
    }

    /**
     * Fetch a new access token from FatSecret OAuth 2.0 endpoint
     *
     * Uses client credentials flow with Basic authentication.
     *
     * @returns New access token with expiration metadata
     * @throws Error if authentication fails
     * @private
     */
    private async fetchNewToken(): Promise<FatSecretAuthToken> {
        const authHeader = Buffer.from(
            `${this.config.clientId}:${this.config.clientSecret}`
        ).toString('base64')

        try {
            logger.debug('FatSecret: requesting new OAuth token', {
                context: 'fatsecret-auth',
                timestamp: new Date().toISOString()
            })

            const response = await fetch('https://oauth.fatsecret.com/connect/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Basic ${authHeader}`
                },
                body: new URLSearchParams({
                    grant_type: 'client_credentials',
                    scope: 'basic'
                })
            })

            if (!response.ok) {
                const errorText = await response.text()
                const errorMessage = `OAuth authentication failed: ${response.status} ${response.statusText} - ${errorText}`

                // Log authentication error with full context
                logger.error('FatSecret: OAuth authentication failed', {
                    status: response.status,
                    statusText: response.statusText,
                    errorText,
                    context: 'fatsecret-auth',
                    timestamp: new Date().toISOString()
                })

                throw new Error(errorMessage)
            }

            const data = await response.json()

            // Validate response structure
            if (!data.access_token || !data.expires_in) {
                logger.error('FatSecret: invalid OAuth response structure', {
                    hasAccessToken: !!data.access_token,
                    hasExpiresIn: !!data.expires_in,
                    context: 'fatsecret-auth',
                    timestamp: new Date().toISOString()
                })
                throw new Error('Invalid OAuth response: missing required fields')
            }

            // Calculate expiration with 1-minute buffer
            const expiresAt = Date.now() + (data.expires_in * 1000) - 60000

            logger.debug('FatSecret: OAuth token received', {
                expiresIn: data.expires_in,
                expiresAt: new Date(expiresAt).toISOString(),
                context: 'fatsecret-auth'
            })

            return {
                access_token: data.access_token,
                token_type: data.token_type || 'Bearer',
                expires_in: data.expires_in,
                expires_at: expiresAt
            }
        } catch (error) {
            // Log the error with context
            logger.error('FatSecret: OAuth token fetch failed', {
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                context: 'fatsecret-auth',
                timestamp: new Date().toISOString()
            })

            if (error instanceof Error) {
                throw error
            }
            throw new Error(`OAuth authentication failed: ${String(error)}`)
        }
    }

    /**
     * Check if a token is expired or about to expire
     *
     * @param token - Token to check
     * @returns true if token is expired or will expire soon
     * @private
     */
    private isTokenExpired(token: FatSecretAuthToken): boolean {
        return Date.now() >= token.expires_at
    }

    /**
     * Clear cached token (useful for testing or forcing refresh)
     */
    clearCache(): void {
        this.cache.token = null
        this.cache.refreshPromise = null
        logger.debug('FatSecret token cache cleared', {
            context: 'fatsecret-auth'
        })
    }
}

/**
 * Singleton instance of FatSecret auth manager
 * Initialized lazily on first use
 */
let authManagerInstance: FatSecretAuthManager | null = null

/**
 * Get the singleton FatSecret authentication manager instance
 *
 * @param config - FatSecret configuration (required on first call)
 * @returns Singleton auth manager instance
 * @throws Error if called without config before initialization
 */
export function getFatSecretAuthManager(config?: FatSecretConfiguration): FatSecretAuthManager {
    if (!authManagerInstance) {
        if (!config) {
            throw new Error('FatSecret auth manager not initialized. Provide config on first call.')
        }
        authManagerInstance = new FatSecretAuthManager(config)
    }
    return authManagerInstance
}

/**
 * Reset the singleton instance (useful for testing)
 */
export function resetFatSecretAuthManager(): void {
    authManagerInstance = null
}
