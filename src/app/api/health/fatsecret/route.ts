import { NextResponse } from 'next/server'
import { getFatSecretConfigHealth } from '@/config/fatsecret'

/**
 * FatSecret Configuration Health Check Endpoint
 *
 * GET /api/health/fatsecret
 *
 * Returns the current health status of FatSecret API configuration.
 * This endpoint does not make any external API calls.
 *
 * @returns Health check status with configuration details
 */
export async function GET() {
    try {
        const health = getFatSecretConfigHealth()

        // Return appropriate status code based on health
        const statusCode = health.healthy ? 200 : 503

        return NextResponse.json(health, { status: statusCode })
    } catch (error) {
        return NextResponse.json(
            {
                healthy: false,
                enabled: false,
                hasCredentials: false,
                issues: ['Failed to check configuration health'],
                timestamp: new Date().toISOString(),
                error: error instanceof Error ? error.message : 'Unknown error'
            },
            { status: 500 }
        )
    }
}
