#!/usr/bin/env node
/**
 * A stand-in for Yandex ID, for the end-to-end suite and local runs.
 *
 * Registration through a provider cannot be exercised against the real one:
 * it needs a person at Yandex's sign-in page and an address nobody has used
 * yet. The API is pointed here with `OAUTH_YANDEX_BASE_URL` (refused in
 * production — config.Load), and talks to it exactly as it talks to Yandex:
 *
 *   GET  /authorize?redirect_uri=…&state=…[&login_hint=<email>]
 *        → 302 to redirect_uri?code=<email, base64url>&state=<state>
 *   POST /token   (form: code=…)  → {"access_token": "stub.<email, base64url>"}
 *   GET  /info    (Authorization: OAuth <token>) → a Yandex-shaped profile
 *
 * The address travels inside the code and the token, so the stub keeps no
 * state: two tests signing up at once cannot get each other's account. A test
 * picks a fresh address by adding `login_hint` to the authorize URL the API
 * redirected it to; without one the stub makes one up. The profile id is
 * derived from the address, so signing in again with the same address is the
 * same Yandex user, as it would be for real.
 *
 * No dependencies. Run: node scripts/oauth-stub.mjs   (OAUTH_STUB_PORT, default 3071)
 */
import http from 'node:http'
import { createHash, randomInt } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const encode = (text) => Buffer.from(text, 'utf8').toString('base64url')
const decode = (text) => Buffer.from(text, 'base64url').toString('utf8')

/** Only an address may come back out of a code or a token — nothing else. */
const looksLikeEmail = (value) => /^[^\s@]+@[^\s@]+$/.test(value)

function freshEmail() {
    return `e2e-oauth-${Date.now()}-${randomInt(100000)}@burcev.test`
}

/** The Yandex user id for an address: stable, so a second sign-in is the same person. */
export function profileIdFor(email) {
    return createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 16)
}

function json(response, status, body) {
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
    response.end(JSON.stringify(body))
}

function readBody(request) {
    return new Promise((resolve, reject) => {
        let body = ''
        request.setEncoding('utf8')
        request.on('data', (chunk) => (body += chunk))
        request.on('end', () => resolve(body))
        request.on('error', reject)
    })
}

function authorize(url, response) {
    const redirectURI = url.searchParams.get('redirect_uri')
    const state = url.searchParams.get('state')
    if (!redirectURI || !state) {
        return json(response, 400, { error: 'invalid_request', error_description: 'redirect_uri and state are required' })
    }
    let target
    try {
        target = new URL(redirectURI)
    } catch {
        return json(response, 400, { error: 'invalid_request', error_description: 'redirect_uri is not a URL' })
    }

    const hint = url.searchParams.get('login_hint')
    const email = hint && looksLikeEmail(hint) ? hint : freshEmail()

    target.searchParams.set('code', encode(email))
    target.searchParams.set('state', state)
    response.writeHead(302, { Location: target.toString() })
    response.end()
}

async function token(request, response) {
    const form = new URLSearchParams(await readBody(request))
    const email = decode(form.get('code') ?? '')
    if (!looksLikeEmail(email)) {
        return json(response, 400, { error: 'invalid_grant', error_description: 'unknown code' })
    }
    json(response, 200, { access_token: `stub.${encode(email)}`, token_type: 'bearer', expires_in: 3600 })
}

function info(request, response) {
    const match = /^OAuth stub\.(.+)$/.exec(request.headers.authorization ?? '')
    const email = match ? decode(match[1]) : ''
    if (!looksLikeEmail(email)) {
        return json(response, 401, { error: 'invalid_token' })
    }
    const local = email.split('@')[0]
    json(response, 200, {
        id: profileIdFor(email),
        login: local,
        default_email: email,
        emails: [email],
        display_name: `E2E ${local}`,
        real_name: `E2E ${local}`,
        first_name: 'E2E',
        last_name: local,
        is_avatar_empty: true,
    })
}

/** The stub as a server, not yet listening — the test drives it directly. */
export function createStub() {
    return http.createServer((request, response) => {
        const url = new URL(request.url ?? '/', 'http://stub.invalid')
        const route = `${request.method} ${url.pathname}`
        Promise.resolve()
            .then(() => {
                switch (route) {
                    case 'GET /authorize':
                        return authorize(url, response)
                    case 'POST /token':
                        return token(request, response)
                    case 'GET /info':
                        return info(request, response)
                    case 'GET /health':
                        return json(response, 200, { status: 'ok' })
                    default:
                        return json(response, 404, { error: 'not_found', route })
                }
            })
            .catch((error) => {
                if (!response.headersSent) json(response, 500, { error: String(error?.message ?? error) })
            })
    })
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    const port = Number(process.env.OAUTH_STUB_PORT || 3071)
    createStub().listen(port, '127.0.0.1', () => {
        console.log(`oauth stub (Yandex ID stand-in) on http://localhost:${port}`)
    })
}
