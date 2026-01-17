/**
 * Unit Tests: FatSecret Configuration
 * **Validates: Requirements 11.5**
 */

import { getFatSecretConfig, validateFatSecretConfig, getFatSecretConfigHealth } from '@/config/fatsecret'

describe('FatSecret Configuration', () => {
    const originalEnv = process.env

    beforeEach(() => {
        // Reset environment before each test
        process.env = { ...originalEnv }
    })

    afterEach(() => {
        // Restore original environment
        process.env = originalEnv
    })

    describe('getFatSecretConfig', () => {
        it('should disable integration when credentials are missing', () => {
            process.env.FATSECRET_ENABLED = 'true'
            process.env.FATSECRET_CLIENT_ID = ''
            process.env.FATSECRET_CLIENT_SECRET = ''

            const config = getFatSecretConfig()

            expect(config.enabled).toBe(false)
            expect(config.clientId).toBe('')
            expect(config.clientSecret).toBe('')
        })

        it('should disable integration when client ID is missing', () => {
            process.env.FATSECRET_ENABLED = 'true'
            process.env.FATSECRET_CLIENT_ID = ''
            process.env.FATSECRET_CLIENT_SECRET = 'test_secret'

            const config = getFatSecretConfig()

            expect(config.enabled).toBe(false)
        })

        it('should disable integration when client secret is missing', () => {
            process.env.FATSECRET_ENABLED = 'true'
            process.env.FATSECRET_CLIENT_ID = 'test_id'
            process.env.FATSECRET_CLIENT_SECRET = ''

            const config = getFatSecretConfig()

            expect(config.enabled).toBe(false)
        })

        it('should enable integration when credentials are present', () => {
            process.env.FATSECRET_ENABLED = 'true'
            process.env.FATSECRET_CLIENT_ID = 'test_id'
            process.env.FATSECRET_CLIENT_SECRET = 'test_secret'

            const config = getFatSecretConfig()

            expect(config.enabled).toBe(true)
            expect(config.clientId).toBe('test_id')
            expect(config.clientSecret).toBe('test_secret')
        })

        it('should respect explicit disable flag', () => {
            process.env.FATSECRET_ENABLED = 'false'
            process.env.FATSECRET_CLIENT_ID = 'test_id'
            process.env.FATSECRET_CLIENT_SECRET = 'test_secret'

            const config = getFatSecretConfig()

            expect(config.enabled).toBe(false)
        })

        it('should apply default timeout when not specified', () => {
            process.env.FATSECRET_ENABLED = 'true'
            process.env.FATSECRET_CLIENT_ID = 'test_id'
            process.env.FATSECRET_CLIENT_SECRET = 'test_secret'
            delete process.env.FATSECRET_TIMEOUT

            const config = getFatSecretConfig()

            expect(config.timeout).toBe(5000)
        })

        it('should apply custom timeout when specified', () => {
            process.env.FATSECRET_ENABLED = 'true'
            process.env.FATSECRET_CLIENT_ID = 'test_id'
            process.env.FATSECRET_CLIENT_SECRET = 'test_secret'
            process.env.FATSECRET_TIMEOUT = '10000'

            const config = getFatSecretConfig()

            expect(config.timeout).toBe(10000)
        })

        it('should apply default maxResults when not specified', () => {
            process.env.FATSECRET_ENABLED = 'true'
            process.env.FATSECRET_CLIENT_ID = 'test_id'
            process.env.FATSECRET_CLIENT_SECRET = 'test_secret'
            delete process.env.FATSECRET_MAX_RESULTS

            const config = getFatSecretConfig()

            expect(config.maxResults).toBe(20)
        })

        it('should apply custom maxResults when specified', () => {
            process.env.FATSECRET_ENABLED = 'true'
            process.env.FATSECRET_CLIENT_ID = 'test_id'
            process.env.FATSECRET_CLIENT_SECRET = 'test_secret'
            process.env.FATSECRET_MAX_RESULTS = '50'

            const config = getFatSecretConfig()

            expect(config.maxResults).toBe(50)
        })

        it('should apply default baseUrl when not specified', () => {
            process.env.FATSECRET_ENABLED = 'true'
            process.env.FATSECRET_CLIENT_ID = 'test_id'
            process.env.FATSECRET_CLIENT_SECRET = 'test_secret'
            delete process.env.FATSECRET_BASE_URL

            const config = getFatSecretConfig()

            expect(config.baseUrl).toBe('https://platform.fatsecret.com/rest/server.api')
        })

        it('should apply custom baseUrl when specified', () => {
            process.env.FATSECRET_ENABLED = 'true'
            process.env.FATSECRET_CLIENT_ID = 'test_id'
            process.env.FATSECRET_CLIENT_SECRET = 'test_secret'
            process.env.FATSECRET_BASE_URL = 'https://custom.api.com'

            const config = getFatSecretConfig()

            expect(config.baseUrl).toBe('https://custom.api.com')
        })

        it('should enable fallback by default', () => {
            process.env.FATSECRET_ENABLED = 'true'
            process.env.FATSECRET_CLIENT_ID = 'test_id'
            process.env.FATSECRET_CLIENT_SECRET = 'test_secret'
            delete process.env.FATSECRET_FALLBACK_ENABLED

            const config = getFatSecretConfig()

            expect(config.fallbackEnabled).toBe(true)
        })

        it('should disable fallback when explicitly set to false', () => {
            process.env.FATSECRET_ENABLED = 'true'
            process.env.FATSECRET_CLIENT_ID = 'test_id'
            process.env.FATSECRET_CLIENT_SECRET = 'test_secret'
            process.env.FATSECRET_FALLBACK_ENABLED = 'false'

            const config = getFatSecretConfig()

            expect(config.fallbackEnabled).toBe(false)
        })

        it('should handle invalid timeout gracefully', () => {
            process.env.FATSECRET_ENABLED = 'true'
            process.env.FATSECRET_CLIENT_ID = 'test_id'
            process.env.FATSECRET_CLIENT_SECRET = 'test_secret'
            process.env.FATSECRET_TIMEOUT = 'invalid'

            const config = getFatSecretConfig()

            // Should fall back to default when parsing fails
            expect(typeof config.timeout).toBe('number')
            expect(isNaN(config.timeout)).toBe(false)
            expect(config.timeout).toBe(5000) // default value
        })

        it('should handle invalid maxResults gracefully', () => {
            process.env.FATSECRET_ENABLED = 'true'
            process.env.FATSECRET_CLIENT_ID = 'test_id'
            process.env.FATSECRET_CLIENT_SECRET = 'test_secret'
            process.env.FATSECRET_MAX_RESULTS = 'invalid'

            const config = getFatSecretConfig()

            // Should fall back to default when parsing fails
            expect(typeof config.maxResults).toBe('number')
            expect(isNaN(config.maxResults)).toBe(false)
            expect(config.maxResults).toBe(20) // default value
        })
    })

    describe('validateFatSecretConfig', () => {
        it('should return false when integration is disabled', () => {
            process.env.FATSECRET_ENABLED = 'false'
            process.env.FATSECRET_CLIENT_ID = 'test_id'
            process.env.FATSECRET_CLIENT_SECRET = 'test_secret'

            const isValid = validateFatSecretConfig()

            expect(isValid).toBe(false)
        })

        it('should return false when credentials are missing', () => {
            process.env.FATSECRET_ENABLED = 'true'
            process.env.FATSECRET_CLIENT_ID = ''
            process.env.FATSECRET_CLIENT_SECRET = ''

            const isValid = validateFatSecretConfig()

            expect(isValid).toBe(false)
        })

        it('should return true when integration is enabled with valid credentials', () => {
            process.env.FATSECRET_ENABLED = 'true'
            process.env.FATSECRET_CLIENT_ID = 'test_id'
            process.env.FATSECRET_CLIENT_SECRET = 'test_secret'

            const isValid = validateFatSecretConfig()

            expect(isValid).toBe(true)
        })
    })

    describe('getFatSecretConfigHealth', () => {
        it('should return unhealthy status when integration is disabled', () => {
            process.env.FATSECRET_ENABLED = 'false'
            process.env.FATSECRET_CLIENT_ID = 'test_id'
            process.env.FATSECRET_CLIENT_SECRET = 'test_secret'

            const health = getFatSecretConfigHealth()

            expect(health.healthy).toBe(false)
            expect(health.enabled).toBe(false)
            expect(health.issues).toContain('Integration is disabled')
        })

        it('should return unhealthy status when credentials are missing', () => {
            process.env.FATSECRET_ENABLED = 'true'
            process.env.FATSECRET_CLIENT_ID = ''
            process.env.FATSECRET_CLIENT_SECRET = ''

            const health = getFatSecretConfigHealth()

            expect(health.healthy).toBe(false)
            expect(health.hasCredentials).toBe(false)
            expect(health.issues.length).toBeGreaterThan(0)
        })

        it('should return healthy status with valid configuration', () => {
            process.env.FATSECRET_ENABLED = 'true'
            process.env.FATSECRET_CLIENT_ID = 'test_id'
            process.env.FATSECRET_CLIENT_SECRET = 'test_secret'
            process.env.FATSECRET_TIMEOUT = '5000'
            process.env.FATSECRET_MAX_RESULTS = '20'

            const health = getFatSecretConfigHealth()

            expect(health.healthy).toBe(true)
            expect(health.enabled).toBe(true)
            expect(health.hasCredentials).toBe(true)
            expect(health.issues).toEqual([])
        })

        it('should warn about low timeout values', () => {
            process.env.FATSECRET_ENABLED = 'true'
            process.env.FATSECRET_CLIENT_ID = 'test_id'
            process.env.FATSECRET_CLIENT_SECRET = 'test_secret'
            process.env.FATSECRET_TIMEOUT = '500'

            const health = getFatSecretConfigHealth()

            expect(health.issues.some(issue => issue.includes('Timeout too low'))).toBe(true)
        })

        it('should warn about high timeout values', () => {
            process.env.FATSECRET_ENABLED = 'true'
            process.env.FATSECRET_CLIENT_ID = 'test_id'
            process.env.FATSECRET_CLIENT_SECRET = 'test_secret'
            process.env.FATSECRET_TIMEOUT = '40000'

            const health = getFatSecretConfigHealth()

            expect(health.issues.some(issue => issue.includes('Timeout too high'))).toBe(true)
        })

        it('should warn about low maxResults values', () => {
            process.env.FATSECRET_ENABLED = 'true'
            process.env.FATSECRET_CLIENT_ID = 'test_id'
            process.env.FATSECRET_CLIENT_SECRET = 'test_secret'
            process.env.FATSECRET_MAX_RESULTS = '0'

            const health = getFatSecretConfigHealth()

            expect(health.issues.some(issue => issue.includes('maxResults too low'))).toBe(true)
        })

        it('should warn about high maxResults values', () => {
            process.env.FATSECRET_ENABLED = 'true'
            process.env.FATSECRET_CLIENT_ID = 'test_id'
            process.env.FATSECRET_CLIENT_SECRET = 'test_secret'
            process.env.FATSECRET_MAX_RESULTS = '150'

            const health = getFatSecretConfigHealth()

            expect(health.issues.some(issue => issue.includes('maxResults too high'))).toBe(true)
        })

        it('should warn about non-HTTPS base URL', () => {
            process.env.FATSECRET_ENABLED = 'true'
            process.env.FATSECRET_CLIENT_ID = 'test_id'
            process.env.FATSECRET_CLIENT_SECRET = 'test_secret'
            process.env.FATSECRET_BASE_URL = 'http://insecure.api.com'

            const health = getFatSecretConfigHealth()

            expect(health.issues.some(issue => issue.includes('HTTPS protocol'))).toBe(true)
        })

        it('should include timestamp in health check', () => {
            process.env.FATSECRET_ENABLED = 'true'
            process.env.FATSECRET_CLIENT_ID = 'test_id'
            process.env.FATSECRET_CLIENT_SECRET = 'test_secret'

            const health = getFatSecretConfigHealth()

            expect(health.timestamp).toBeDefined()
            expect(typeof health.timestamp).toBe('string')
            expect(new Date(health.timestamp).toString()).not.toBe('Invalid Date')
        })

        it('should return all required fields in health check', () => {
            process.env.FATSECRET_ENABLED = 'true'
            process.env.FATSECRET_CLIENT_ID = 'test_id'
            process.env.FATSECRET_CLIENT_SECRET = 'test_secret'

            const health = getFatSecretConfigHealth()

            expect(health).toHaveProperty('healthy')
            expect(health).toHaveProperty('enabled')
            expect(health).toHaveProperty('hasCredentials')
            expect(health).toHaveProperty('issues')
            expect(health).toHaveProperty('timestamp')
        })
    })
})
