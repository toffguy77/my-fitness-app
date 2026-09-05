/**
 * Deciding, before a page renders, whether the person is signed in.
 *
 * Until now every protected screen decided this for itself, after loading, by
 * looking in localStorage — which meant a moment of signed-in interface before
 * the redirect, on every page, and one more place to forget when adding a
 * screen.
 *
 * The check here reads a cookie called `session_present`, which the API sets
 * beside the refresh token. It carries no credential and grants nothing: the
 * refresh token itself is scoped to `/api/v1/auth` so it does not travel with
 * every request, and that scoping is precisely why the edge cannot see it.
 * Every endpoint still demands a real token — this only decides whether to
 * render a page or send somebody to sign in.
 */

import { NextResponse, type NextRequest } from 'next/server'

const SESSION_MARKER = 'session_present'

/** The screens that need an account. Anything else is open to a visitor. */
const PROTECTED = [
    '/dashboard',
    '/food-tracker',
    '/chat',
    '/profile',
    '/settings',
    '/notifications',
    '/curator',
    '/admin',
    '/onboarding',
]

function needsAnAccount(pathname: string): boolean {
    return PROTECTED.some(
        (prefix) => pathname === prefix || pathname.startsWith(prefix + '/')
    )
}

/**
 * A per-response nonce, so the content policy can name the one inline script
 * we ship instead of allowing every inline script on the page.
 */
function makeNonce(): string {
    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    return btoa(String.fromCharCode(...bytes))
}

/**
 * The content policy.
 *
 * Production had no policy at all: the nginx files in deploy/ carried one, but
 * nothing serves through nginx — the traffic goes through Traefik — so the
 * header existed only in the repository. Setting it here puts it where it is
 * actually sent.
 *
 * `'strict-dynamic'` lets the scripts our nonce vouches for load the chunks
 * they need, which is what makes a nonce workable in a Next application at
 * all. `'unsafe-eval'` is gone. `'unsafe-inline'` stays for styles only —
 * Tailwind and Next both emit inline style attributes, and a style cannot run
 * code.
 */
function contentSecurityPolicy(nonce: string): string {
    return [
        "default-src 'self'",
        `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://mc.yandex.ru`,
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https:",
        "font-src 'self' data:",
        "connect-src 'self' https: wss:",
        "frame-src https://mc.yandex.ru",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        'upgrade-insecure-requests',
    ].join('; ')
}

export function middleware(request: NextRequest) {
    const nonce = makeNonce()
    const policy = contentSecurityPolicy(nonce)

    if (needsAnAccount(request.nextUrl.pathname) && !request.cookies.has(SESSION_MARKER)) {
        // Where they were going, so signing in returns them there rather than
        // to a dashboard they did not ask for.
        const signIn = new URL('/auth', request.url)
        signIn.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search)
        const redirect = NextResponse.redirect(signIn)
        redirect.headers.set('Content-Security-Policy', policy)
        return redirect
    }

    // The nonce reaches the page through a request header: Next reads it and
    // stamps its own script tags, and the layout puts it on ours.
    const headers = new Headers(request.headers)
    headers.set('x-nonce', nonce)
    headers.set('Content-Security-Policy', policy)

    const response = NextResponse.next({ request: { headers } })
    response.headers.set('Content-Security-Policy', policy)
    // The rest of what nginx was supposed to be sending and was not.
    response.headers.set('X-Content-Type-Options', 'nosniff')
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
    response.headers.set('X-Frame-Options', 'DENY')
    response.headers.set(
        'Permissions-Policy',
        'camera=(), microphone=(), geolocation=(), interest-cohort=()'
    )
    return response
}

export const config = {
    matcher: [
        /*
         * Everything a person sees, because the content policy has to be on
         * every page — not only the ones behind a sign-in. Static assets and
         * the service worker are excluded: they carry no markup and no policy
         * to violate.
         */
        {
            source: '/((?!_next/static|_next/image|favicon.ico|icon.svg|logo.svg|manifest.json|sw.js|push-sw.js|workbox-.*).*)',
            missing: [{ type: 'header', key: 'next-action' }],
        },
    ],
}
