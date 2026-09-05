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

export function middleware(request: NextRequest) {
    if (request.cookies.has(SESSION_MARKER)) {
        return NextResponse.next()
    }

    // Where they were going, so signing in returns them there rather than to
    // a dashboard they did not ask for.
    const signIn = new URL('/auth', request.url)
    signIn.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search)
    return NextResponse.redirect(signIn)
}

export const config = {
    matcher: [
        '/dashboard/:path*',
        '/food-tracker/:path*',
        '/chat/:path*',
        '/profile/:path*',
        '/settings/:path*',
        '/notifications/:path*',
        '/curator/:path*',
        '/admin/:path*',
        '/onboarding/:path*',
    ],
}
