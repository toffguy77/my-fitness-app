import { test as base, expect, type BrowserContext } from '@playwright/test'

import { getAccount } from './test-accounts'

/**
 * A session per test, established through the API.
 *
 * The suite used to share one saved `storageState` across every test for the
 * whole run. That worked while the session lived in localStorage, because the
 * access token there was good for fifteen minutes and most tests never had to
 * refresh.
 *
 * With the session in a cookie, every fresh browser context starts with no
 * access token and mints one from the refresh cookie on its first page. The
 * refresh token rotates on every use — so replaying one frozen cookie across
 * a hundred tests over half an hour is, from the server's point of view,
 * exactly the token reuse it is built to detect. It revoked the family, and
 * every test after that landed on the sign-in page.
 *
 * The server is right and stays as it is: reuse of a rotated token is how a
 * stolen session is caught. What was wrong is a harness that replays one.
 * Each test now signs in for itself — an API call, not a form — so every
 * context has a token family of its own and nothing is ever replayed.
 */

/**
 * Signs the context in, leaving the cookies the server set on it, and returns
 * the access token.
 *
 * The token is returned because the API authenticates by `Authorization`
 * header, not by the session cookie — the cookie exists so a page can mint a
 * token, and a test calling the API directly has to carry one itself.
 */
export async function signIn(
    context: BrowserContext,
    baseURL: string,
    role: string
): Promise<string> {
    const account = getAccount(role)

    const response = await context.request.post(`${baseURL}/api/v1/auth/login`, {
        data: { email: account.email, password: account.password },
    })

    expect(
        response.ok(),
        `signing in as ${role} failed with ${response.status()}: ${await response.text()}`
    ).toBeTruthy()

    // The cookies the server set are already on the context: `context.request`
    // shares its cookie jar with the pages. Asserted rather than assumed —
    // without them every test lands on the sign-in page with no explanation,
    // which is the failure that cost the most time to read.
    const cookies = await context.cookies()
    expect(
        cookies.map((cookie) => cookie.name),
        'the sign-in set no session cookie'
    ).toContain('session_present')

    const body = await response.json()
    const token = body?.data?.token
    expect(token, 'the sign-in returned no access token').toBeTruthy()
    return token as string
}

/** The headers an API call needs to be recognised as this person. */
export function asUser(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}` }
}

/** Who the test is signed in as. Undefined means "signed out". */
export type SessionOptions = { role?: 'client' | 'curator' | 'admin' }

/**
 * `test` with a session already established, chosen by the `role` option — set
 * per project, and overridable per file with `test.use({ role: undefined })`
 * for the tests that need to start signed out and sign in themselves.
 */
export const test = base.extend<SessionOptions>({
    role: [undefined, { option: true }],

    context: async ({ context, baseURL, role }, use) => {
        if (role && baseURL) {
            await signIn(context, baseURL, role)
        }
        await use(context)
    },
})

export { expect }
