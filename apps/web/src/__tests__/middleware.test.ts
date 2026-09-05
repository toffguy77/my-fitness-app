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
    // A screen missing from this list renders for a signed-out visitor and
    // then fails one request at a time, which reads as a broken product rather
    // than as "please sign in".
    it.each([
        '/dashboard',
        '/dashboard/weekly',
        '/food-tracker',
        '/food-tracker/nutrient/vitamin-d',
        '/chat',
        '/profile',
        '/settings/notifications',
        '/notifications',
        '/curator/clients/7',
        '/admin/users',
        '/onboarding',
    ])('sends a signed-out visitor away from %s', (path) => {
        expect(middleware(requestTo(path)).status).toBe(307)
    })

    it.each(['/', '/auth', '/content', '/onboarding-guest', '/unsubscribe'])(
        'lets a signed-out visitor reach %s',
        (path) => {
            expect(middleware(requestTo(path)).status).toBe(200)
        }
    )

    it('does not run on static assets', () => {
        // They carry no markup and no policy to violate, and running on them
        // would put a nonce in a cached response.
        const source = (config.matcher[0] as { source: string }).source
        expect(source).toContain('_next/static')
        expect(source).toContain('sw.js')
    })
})

describe('the content security policy', () => {
    // Production was serving no policy at all: the nginx files in deploy/
    // carried one, but nothing serves through nginx — the traffic goes through
    // Traefik — so the header existed only in the repository.
    function policyFor(path: string): string {
        const response = middleware(requestTo(path, { session_present: '1' }))
        return response.headers.get('content-security-policy') ?? ''
    }

    it('is sent on a page a visitor can reach without an account', () => {
        expect(middleware(requestTo('/auth')).headers.get('content-security-policy'))
            .toContain("default-src 'self'")
    })

    it('is sent on the redirect too', () => {
        const response = middleware(requestTo('/dashboard'))

        expect(response.status).toBe(307)
        expect(response.headers.get('content-security-policy')).toContain("default-src 'self'")
    })

    it('names one nonce instead of allowing every inline script', () => {
        const policy = policyFor('/dashboard')

        expect(policy).toMatch(/script-src [^;]*'nonce-[A-Za-z0-9+/=]+'/)
        expect(policy).not.toContain("script-src 'self' 'unsafe-inline'")
    })

    it('uses a different nonce every time', () => {
        // A nonce reused across responses is a nonce an attacker can copy out
        // of one page and paste into an injection on the next.
        const first = policyFor('/dashboard').match(/'nonce-([^']+)'/)?.[1]
        const second = policyFor('/dashboard').match(/'nonce-([^']+)'/)?.[1]

        expect(first).toBeTruthy()
        expect(first).not.toBe(second)
    })

    it('does not allow eval', () => {
        expect(policyFor('/dashboard')).not.toContain('unsafe-eval')
    })

    it('allows the analytics script we actually load', () => {
        expect(policyFor('/dashboard')).toContain('https://mc.yandex.ru')
    })

    it('forbids being framed and forbids plugins', () => {
        const policy = policyFor('/dashboard')

        expect(policy).toContain("frame-ancestors 'none'")
        expect(policy).toContain("object-src 'none'")
    })

    it('hands the nonce to the page through a request header', () => {
        // Next reads it to stamp its own script tags; the layout puts it on
        // ours. Without it the inline script is refused and the page does not
        // register its service worker.
        const response = middleware(requestTo('/dashboard', { session_present: '1' }))
        const policyNonce = response.headers.get('content-security-policy')?.match(/'nonce-([^']+)'/)?.[1]

        expect(policyNonce).toBeTruthy()
    })

    it('sends the other headers nginx was supposed to be sending', () => {
        const response = middleware(requestTo('/dashboard', { session_present: '1' }))

        expect(response.headers.get('x-content-type-options')).toBe('nosniff')
        expect(response.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
        expect(response.headers.get('x-frame-options')).toBe('DENY')
        expect(response.headers.get('permissions-policy')).toContain('camera=()')
    })
})
