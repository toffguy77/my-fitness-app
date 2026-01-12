import { NextResponse } from 'next/server'

/**
 * Health check endpoint for Docker container monitoring
 * Returns 200 OK if the application is running properly
 */
export async function GET() {
    try {
        // Basic health checks
        const healthStatus = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            version: process.env.NEXT_PUBLIC_APP_VERSION || 'unknown',
            environment: process.env.NODE_ENV || 'unknown',
            memory: {
                used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
                total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
            },
        }

        return NextResponse.json(healthStatus, { status: 200 })
    } catch (error) {
        console.error('Health check failed:', error)

        return NextResponse.json(
            {
                status: 'unhealthy',
                timestamp: new Date().toISOString(),
                error: 'Health check failed',
            },
            { status: 503 }
        )
    }
}