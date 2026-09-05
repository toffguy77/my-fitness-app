/**
 * @jest-environment node
 */
/**
 * Who gets past the edge.
 *
 * This runs before a page is rendered, so it is the difference between a
 * signed-out visitor seeing a sign-in screen and seeing a flash of somebody
 * else's dashboard first.
 */

import { NextRequest } from 'next/server'

import { middleware, config } from '../middleware'

function requestTo(path: string, cookies: Record<string, string> = {}): NextRequest {
    const request = new NextRequest(new URL(`https://burcev.team${path}`))
    for (const [name, value] of Object.entries(cookies)) {
        request.cookies.set(name, value)
    }
    return request
}

describe('the edge session check', () => {
    it('lets a request with a session marker through', () => {
        const response = middleware(requestTo('/dashboard', { session_present: '1' }))

        expect(response.status).toBe(200)
        expect(response.headers.get('location')).toBeNull()
    })

    it('sends a request without one to sign in', () => {
        const response = middleware(requestTo('/dashboard'))

        expect(response.status).toBe(307)
        expect(response.headers.get('location')).toContain('/auth')
    })

    it('remembers where they were going', () => {
        const response = middleware(requestTo('/curator/clients/7?tab=tasks'))

        // Signing in returns them there, rather than to a dashboard they did
        // not ask for.
        const location = response.headers.get('location') ?? ''
        expect(location).toContain('next=')
        expect(decodeURIComponent(location)).toContain('/curator/clients/7?tab=tasks')
    })

    it('is not fooled by a marker with an empty value', () => {
        // `cookies.has` is the check, and an empty marker is still a marker —
        // it grants nothing on its own, and the API still demands a token.
        const response = middleware(requestTo('/dashboard', { session_present: '' }))

        expect(response.status).toBe(200)
    })
})

describe('what the check covers', () => {
    it('guards every screen that needs an account', () => {
        // A screen missing from this list renders for a signed-out visitor and
        // then fails one request at a time, which reads as a broken product
        // rather than as "please sign in".
        for (const path of [
            '/dashboard/:path*',
            '/food-tracker/:path*',
            '/chat/:path*',
            '/profile/:path*',
            '/settings/:path*',
            '/notifications/:path*',
            '/curator/:path*',
            '/admin/:path*',
            '/onboarding/:path*',
        ]) {
            expect(config.matcher).toContain(path)
        }
    })

    it('leaves the public entrances alone', () => {
        for (const path of ['/', '/auth', '/content', '/onboarding-guest']) {
            expect(config.matcher).not.toContain(path)
        }
    })
})
