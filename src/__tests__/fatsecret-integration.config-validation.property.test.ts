/**
 * Property-Based Tests: FatSecret Configuration Validation
 * **Feature: fatsecret-integration, Property 12: Configuration Validation**
 * **Validates: Requirements 11.5**
 */

import fc from 'fast-check'
import { getFatSecretConfig, validateFatSecretConfig, getFatSecretConfigHealth } from '@/config/fatsecret'

describe('Property-Based Tests: FatSecret Configuration Validation', () => {
    const originalEnv = process.env

    beforeEach(() => {
        // Reset environment before each test
        process.env = { ...originalEnv }
    })

    afterEach(() => {
        // Restore original environment
        process.env = originalEnv
    })

    describe('Property 12: Configuration Validation', () => {
        it('should disable integration when credentials are missing', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        hasClientId: fc.boolean(),
                        hasClientSecret: fc.boolean(),
                        enabled: fc.constant('true')
                    }),
                    async ({ hasClientId, hasClientSecret, enabled }) => {
                        // Set up environment
                        process.env.FATSECRET_ENABLED = enabled
                        process.env.FATSECRET_CLIENT_ID = hasClientId ? 'test_client_id' : ''
                        process.env.FATSECRET_CLIENT_SECRET = hasClientSecret ? 'test_client_secret' : ''

                        const config = getFatSecretConfig()

                        // If either credential is missing, integration should be disabled
                        if (!hasClientId || !hasClientSecret) {
                            expect(config.enabled).toBe(false)
                            expect(config.clientId).toBe('')
                            expect(config.clientSecret).toBe('')
                        } else {
                            // If both credentials present, integration should be enabled
                            expect(config.enabled).toBe(true)
                            expect(config.clientId).toBe('test_client_id')
                            expect(config.clientSecret).toBe('test_client_secret')
                        }
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should validate configuration correctly for all credential combinations', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        hasClientId: fc.boolean(),
                        hasClientSecret: fc.boolean(),
                        explicitlyDisabled: fc.boolean()
                    }),
                    async ({ hasClientId, hasClientSecret, explicitlyDisabled }) => {
                        // Set up environment
                        process.env.FATSECRET_ENABLED = explicitlyDisabled ? 'false' : 'true'
                        process.env.FATSECRET_CLIENT_ID = hasClientId ? 'test_client_id' : ''
                        process.env.FATSECRET_CLIENT_SECRET = hasClientSecret ? 'test_client_secret' : ''

                        const isValid = validateFatSecretConfig()

                        // Validation should pass only if:
                        // 1. Not explicitly disabled AND
                        // 2. Both credentials are present
                        const shouldBeValid = !explicitlyDisabled && hasClientId && hasClientSecret

                        expect(isValid).toBe(shouldBeValid)
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should apply default values when environment variables are missing', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        hasTimeout: fc.boolean(),
                        hasMaxResults: fc.boolean(),
                        hasBaseUrl: fc.boolean(),
                        hasFallbackEnabled: fc.boolean()
                    }),
                    async ({ hasTimeout, hasMaxResults, hasBaseUrl, hasFallbackEnabled }) => {
                        // Set up valid credentials
                        process.env.FATSECRET_ENABLED = 'true'
                        process.env.FATSECRET_CLIENT_ID = 'test_client_id'
                        process.env.FATSECRET_CLIENT_SECRET = 'test_client_secret'

                        // Conditionally set optional config
                        if (hasTimeout) {
                            process.env.FATSECRET_TIMEOUT = '10000'
                        } else {
                            delete process.env.FATSECRET_TIMEOUT
                        }

                        if (hasMaxResults) {
                            process.env.FATSECRET_MAX_RESULTS = '50'
                        } else {
                            delete process.env.FATSECRET_MAX_RESULTS
                        }

                        if (hasBaseUrl) {
                            process.env.FATSECRET_BASE_URL = 'https://custom.api.com'
                        } else {
                            delete process.env.FATSECRET_BASE_URL
                        }

                        if (hasFallbackEnabled) {
                            process.env.FATSECRET_FALLBACK_ENABLED = 'false'
                        } else {
                            delete process.env.FATSECRET_FALLBACK_ENABLED
                        }

                        const config = getFatSecretConfig()

                        // Check defaults are applied correctly
                        expect(config.timeout).toBe(hasTimeout ? 10000 : 5000)
                        expect(config.maxResults).toBe(hasMaxResults ? 50 : 20)
                        expect(config.baseUrl).toBe(
                            hasBaseUrl ? 'https://custom.api.com' : 'https://platform.fatsecret.com/rest/server.api'
                        )
                        expect(config.fallbackEnabled).toBe(!hasFallbackEnabled)
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should report health status correctly for all configurations', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        hasClientId: fc.boolean(),
                        hasClientSecret: fc.boolean(),
                        enabled: fc.boolean(),
                        timeout: fc.integer({ min: 0, max: 50000 }),
                        maxResults: fc.integer({ min: 0, max: 200 })
                    }),
                    async ({ hasClientId, hasClientSecret, enabled, timeout, maxResults }) => {
                        // Set up environment
                        process.env.FATSECRET_ENABLED = enabled ? 'true' : 'false'
                        process.env.FATSECRET_CLIENT_ID = hasClientId ? 'test_client_id' : ''
                        process.env.FATSECRET_CLIENT_SECRET = hasClientSecret ? 'test_client_secret' : ''
                        process.env.FATSECRET_TIMEOUT = timeout.toString()
                        process.env.FATSECRET_MAX_RESULTS = maxResults.toString()

                        const health = getFatSecretConfigHealth()

                        // Verify health check properties
                        expect(health).toHaveProperty('healthy')
                        expect(health).toHaveProperty('enabled')
                        expect(health).toHaveProperty('hasCredentials')
                        expect(health).toHaveProperty('issues')
                        expect(health).toHaveProperty('timestamp')

                        // Verify enabled status
                        const expectedEnabled = enabled && hasClientId && hasClientSecret
                        expect(health.enabled).toBe(expectedEnabled)

                        // Verify credentials status
                        expect(health.hasCredentials).toBe(hasClientId && hasClientSecret)

                        // Verify issues array
                        expect(Array.isArray(health.issues)).toBe(true)

                        // If enabled but missing credentials, should have issues
                        if (enabled && (!hasClientId || !hasClientSecret)) {
                            expect(health.issues.length).toBeGreaterThan(0)
                            expect(health.healthy).toBe(false)
                        }

                        // If not enabled, should have "disabled" issue
                        if (!enabled) {
                            expect(health.issues).toContain('Integration is disabled')
                        }

                        // Verify timeout warnings (only if config actually uses the env value)
                        // When credentials are missing, config returns defaults, so env timeout is ignored
                        const configUsesEnvValues = enabled && hasClientId && hasClientSecret

                        if (configUsesEnvValues) {
                            if (timeout < 1000) {
                                expect(health.issues.some(issue => issue.includes('Timeout too low'))).toBe(true)
                            }
                            if (timeout > 30000) {
                                expect(health.issues.some(issue => issue.includes('Timeout too high'))).toBe(true)
                            }

                            // Verify maxResults warnings
                            if (maxResults < 1) {
                                expect(health.issues.some(issue => issue.includes('maxResults too low'))).toBe(true)
                            }
                            if (maxResults > 100) {
                                expect(health.issues.some(issue => issue.includes('maxResults too high'))).toBe(true)
                            }
                        }

                        // Healthy only if enabled, has credentials, and no issues
                        if (expectedEnabled && hasClientId && hasClientSecret) {
                            const hasConfigIssues =
                                timeout < 1000 || timeout > 30000 ||
                                maxResults < 1 || maxResults > 100

                            expect(health.healthy).toBe(!hasConfigIssues)
                        } else {
                            expect(health.healthy).toBe(false)
                        }
                    }
                ),
                { numRuns: 100 }
            )
        })

        it('should handle invalid numeric values gracefully', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        timeout: fc.oneof(
                            fc.constant('invalid'),
                            fc.constant(''),
                            fc.constant('NaN'),
                            fc.integer().map(String)
                        ),
                        maxResults: fc.oneof(
                            fc.constant('invalid'),
                            fc.constant(''),
                            fc.constant('NaN'),
                            fc.integer().map(String)
                        )
                    }),
                    async ({ timeout, maxResults }) => {
                        // Set up valid credentials
                        process.env.FATSECRET_ENABLED = 'true'
                        process.env.FATSECRET_CLIENT_ID = 'test_client_id'
                        process.env.FATSECRET_CLIENT_SECRET = 'test_client_secret'
                        process.env.FATSECRET_TIMEOUT = timeout
                        process.env.FATSECRET_MAX_RESULTS = maxResults

                        const config = getFatSecretConfig()

                        // Should always return valid numbers (defaults or parsed values)
                        expect(typeof config.timeout).toBe('number')
                        expect(typeof config.maxResults).toBe('number')
                        expect(isNaN(config.timeout)).toBe(false)
                        expect(isNaN(config.maxResults)).toBe(false)

                        // If parsing fails, should use defaults
                        const parsedTimeout = parseInt(timeout, 10)
                        const parsedMaxResults = parseInt(maxResults, 10)

                        if (isNaN(parsedTimeout)) {
                            expect(config.timeout).toBe(5000) // default
                        } else {
                            expect(config.timeout).toBe(parsedTimeout)
                        }

                        if (isNaN(parsedMaxResults)) {
                            expect(config.maxResults).toBe(20) // default
                        } else {
                            expect(config.maxResults).toBe(parsedMaxResults)
                        }
                    }
                ),
                { numRuns: 100 }
            )
        })
    })
})
