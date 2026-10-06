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
    // '/onboarding' is deliberately absent: the same path serves the guest
    // calculator, which is the product's front door and needs no account. The
    // page itself decides which of the two audiences it is looking at.
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
        `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://mc.yandex.ru https://mc.yandex.com`,
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https:",
        "font-src 'self' data:",
        // 'self' covers the API and the WebSocket: both are same-origin
        // behind the same router. Naming schemes instead ("https: wss:") broke
        // every environment served over plain http — which is all of them
        // except production.
        // Metrika talks to both domains, and to a socket on each. Naming only
        // the .ru one left the console full of blocked requests.
        "connect-src 'self' https://mc.yandex.ru wss://mc.yandex.ru https://mc.yandex.com wss://mc.yandex.com",
        "frame-src https://mc.yandex.ru https://mc.yandex.com",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        'upgrade-insecure-requests',
    ].join('; ')
}

/**
 * Заголовки безопасности, одинаковые для любого ответа.
 *
 * Вынесены из middleware отдельной функцией, потому что NextRequest в
 * тестовом окружении не построить: у него url только на чтение. Проверять
 * заголовки через живой запрос не вышло бы, а непроверенными они уже один
 * раз оказались — nginx должен был их слать и не слал.
 */
export function applySecurityHeaders(headers: Headers, secure: boolean): void {
    // The rest of what nginx was supposed to be sending and was not.
    headers.set('X-Content-Type-Options', 'nosniff')
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
    headers.set('X-Frame-Options', 'DENY')
    headers.set(
        'Permissions-Policy',
        'camera=(), microphone=(), geolocation=(), interest-cohort=()'
    )
    // HSTS: следующий заход на этот домен браузер сделает только по https,
    // не спрашивая. Без заголовка первый переход по ссылке на http успевает
    // уйти в сеть открытым — вместе с cookie сессии, если она уже есть.
    //
    // Только по https: по http браузер заголовок игнорирует, а на стенде
    // разработки он сделал бы localhost недоступным по http на год вперёд —
    // включая чужие проекты на том же адресе.
    if (secure) {
        headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
    }
}

const LEGACY_ARTICLE_PATH =
    /^\/content\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i

/** How long an old link may wait on the API before it is simply let through. */
const LEGACY_LOOKUP_TIMEOUT_MS = 2000

/**
 * Where an old article address now lives, or null to let the request through.
 *
 * Articles were addressed by UUID before they had slugs, and those addresses
 * are in links and in the index. A public article answers them with a 301 to
 * its readable address — a permanent redirect is what moves a page in search,
 * and `permanentRedirect` in the page would have answered 308.
 *
 * Anything the public API does not have passes through: it may be an article
 * for one curator's clients, which the page hands to the signed-in reader. So
 * does a failure — the page can still render the article itself.
 */
export async function legacyArticleRedirect(
    pathname: string,
    fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
    const match = LEGACY_ARTICLE_PATH.exec(pathname)
    if (!match) return null

    const apiUrl = process.env.INTERNAL_API_URL || 'http://api:4000'
    try {
        const res = await fetchImpl(`${apiUrl}/api/v1/public/content/${match[1]}`, {
            signal: AbortSignal.timeout(LEGACY_LOOKUP_TIMEOUT_MS),
        })
        if (!res.ok) return null
        const data = await res.json()
        const slug: unknown = data?.data?.slug
        return typeof slug === 'string' && slug ? `/content/${slug}` : null
    } catch {
        return null
    }
}

export async function middleware(request: NextRequest) {
    const nonce = makeNonce()
    const policy = contentSecurityPolicy(nonce)

    const movedTo = await legacyArticleRedirect(request.nextUrl.pathname)
    if (movedTo) {
        const redirect = NextResponse.redirect(new URL(movedTo, request.url), 301)
        redirect.headers.set('Content-Security-Policy', policy)
        return redirect
    }

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
    applySecurityHeaders(response.headers, request.nextUrl.protocol === 'https:')
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
            source: '/((?!_next/static|_next/image|favicon.ico|icon.svg|logo.svg|manifest.json|sw.js|workbox-.*).*)',
            missing: [{ type: 'header', key: 'next-action' }],
        },
    ],
}
