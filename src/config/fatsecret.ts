import { logger } from '@/utils/logger'

/**
 * FatSecret API Configuration
 *
 * This module provides centralized configuration for FatSecret API integration.
 * It reads configuration from environment variables and validates required credentials.
 *
 * @see https://platform.fatsecret.com/api/Default.aspx?screen=rapiauth2
 */

export interface FatSecretConfiguration {
    /** Whether FatSecret integration is enabled */
    enabled: boolean
    /** OAuth 2.0 Client ID from FatSecret Platform */
    clientId: string
    /** OAuth 2.0 Client Secret from FatSecret Platform */
    clientSecret: string
    /** Base URL for FatSecret REST API */
    baseUrl: string
    /** Request timeout in milliseconds */
    timeout: number
    /** Maximum number of results to return per search */
    maxResults: number
    /** Whether to fallback to Open Food Facts when FatSecret fails */
    fallbackEnabled: boolean
}

/**
 * Get FatSecret API configuration from environment variables
 *
 * Validates that required credentials are present. If credentials are missing
 * and integration is enabled, logs an error and disables the integration.
 *
 * @returns FatSecret configuration object
 *
 * @example
 * ```typescript
 * const config = getFatSecretConfig()
 * if (config.enabled) {
 *   // Use FatSecret API
 * }
 * ```
 */
export function getFatSecretConfig(): FatSecretConfiguration {
    const enabled = process.env.FATSECRET_ENABLED !== 'false'
    const clientId = process.env.FATSECRET_CLIENT_ID || ''
    const clientSecret = process.env.FATSECRET_CLIENT_SECRET || ''

    // Validate credentials if integration is enabled
    if (enabled && (!clientId || !clientSecret)) {
        logger.error('FatSecret credentials missing, disabling integration', {
            hasClientId: !!clientId,
            hasClientSecret: !!clientSecret,
            context: 'fatsecret-config'
        })

        return {
            enabled: false,
            clientId: '',
            clientSecret: '',
            baseUrl: 'https://platform.fatsecret.com/rest/server.api',
            timeout: 5000,
            maxResults: 20,
            fallbackEnabled: true
        }
    }

    // Parse numeric values with fallback to defaults if invalid
    const timeoutValue = parseInt(process.env.FATSECRET_TIMEOUT || '5000', 10)
    const maxResultsValue = parseInt(process.env.FATSECRET_MAX_RESULTS || '20', 10)

    const config: FatSecretConfiguration = {
        enabled,
        clientId,
        clientSecret,
        baseUrl: process.env.FATSECRET_BASE_URL || 'https://platform.fatsecret.com/rest/server.api',
        timeout: isNaN(timeoutValue) ? 5000 : timeoutValue,
        maxResults: isNaN(maxResultsValue) ? 20 : maxResultsValue,
        fallbackEnabled: process.env.FATSECRET_FALLBACK_ENABLED !== 'false'
    }

    // Log configuration on startup (without sensitive data)
    if (enabled) {
        logger.info('FatSecret integration enabled', {
            baseUrl: config.baseUrl,
            timeout: config.timeout,
            maxResults: config.maxResults,
            fallbackEnabled: config.fallbackEnabled,
            context: 'fatsecret-config'
        })
    }

    return config
}

/**
 * Validate FatSecret configuration at startup
 *
 * This function should be called during application initialization to ensure
 * FatSecret is properly configured before any API calls are made.
 *
 * @returns true if configuration is valid and integration is enabled
 */
export function validateFatSecretConfig(): boolean {
    const config = getFatSecretConfig()

    if (!config.enabled) {
        logger.info('FatSecret integration is disabled', {
            context: 'fatsecret-config'
        })
        return false
    }

    if (!config.clientId || !config.clientSecret) {
        logger.error('FatSecret configuration validation failed: missing credentials', {
            context: 'fatsecret-config'
        })
        return false
    }

    // Validate timeout is reasonable
    if (config.timeout < 1000 || config.timeout > 30000) {
        logger.warn('FatSecret timeout value is outside recommended range (1000-30000ms)', {
            timeout: config.timeout,
            context: 'fatsecret-config'
        })
    }

    // Validate maxResults is reasonable
    if (config.maxResults < 1 || config.maxResults > 100) {
        logger.warn('FatSecret maxResults value is outside recommended range (1-100)', {
            maxResults: config.maxResults,
            context: 'fatsecret-config'
        })
    }

    return true
}

/**
 * Check if FatSecret integration is enabled
 *
 * Simple boolean check for whether FatSecret is configured and enabled.
 * Use this throughout the codebase to check if FatSecret features should be available.
 *
 * @returns true if FatSecret integration is enabled and configured
 *
 * @example
 * ```typescript
 * if (isFatSecretEnabled()) {
 *   // Use FatSecret API
 * } else {
 *   // Fall back to OpenFoodFacts
 * }
 * ```
 */
export function isFatSecretEnabled(): boolean {
    const config = getFatSecretConfig()
    return config.enabled && !!config.clientId && !!config.clientSecret
}

/**
 * Configuration health check status
 */
export interface ConfigHealthCheck {
    /** Whether the configuration is healthy */
    healthy: boolean
    /** Whether FatSecret integration is enabled */
    enabled: boolean
    /** Whether credentials are present */
    hasCredentials: boolean
    /** Configuration issues found */
    issues: string[]
    /** Timestamp of the health check */
    timestamp: string
}

/**
 * Perform a health check on FatSecret configuration
 *
 * This function checks the configuration without making any API calls.
 * It can be used for monitoring and diagnostics.
 *
 * @returns Health check status object
 *
 * @example
 * ```typescript
 * const health = getFatSecretConfigHealth()
 * if (!health.healthy) {
 *   console.error('FatSecret config issues:', health.issues)
 * }
 * ```
 */
export function getFatSecretConfigHealth(): ConfigHealthCheck {
    const config = getFatSecretConfig()
    const issues: string[] = []

    // Check if enabled
    if (!config.enabled) {
        issues.push('Integration is disabled')
    }

    // Check credentials
    const hasCredentials = !!(config.clientId && config.clientSecret)
    if (config.enabled && !hasCredentials) {
        issues.push('Missing required credentials (FATSECRET_CLIENT_ID or FATSECRET_CLIENT_SECRET)')
    }

    // Check timeout (always validate, even if disabled)
    if (config.timeout < 1000) {
        issues.push(`Timeout too low: ${config.timeout}ms (minimum 1000ms recommended)`)
    } else if (config.timeout > 30000) {
        issues.push(`Timeout too high: ${config.timeout}ms (maximum 30000ms recommended)`)
    }

    // Check maxResults (always validate, even if disabled)
    if (config.maxResults < 1) {
        issues.push(`maxResults too low: ${config.maxResults} (minimum 1)`)
    } else if (config.maxResults > 100) {
        issues.push(`maxResults too high: ${config.maxResults} (maximum 100 recommended)`)
    }

    // Check base URL format
    if (config.baseUrl && !config.baseUrl.startsWith('https://')) {
        issues.push('Base URL should use HTTPS protocol')
    }

    // Healthy only if enabled, has credentials, and no configuration issues
    const healthy = config.enabled && hasCredentials && issues.filter(i => i !== 'Integration is disabled').length === 0

    return {
        healthy,
        enabled: config.enabled,
        hasCredentials,
        issues,
        timestamp: new Date().toISOString()
    }
}
