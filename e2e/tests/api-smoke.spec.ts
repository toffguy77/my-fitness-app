import { test, expect, signIn, asUser } from '../fixtures/session'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Every registered GET route, called with a real session.
 *
 * The route table is already checked two ways: the golden file records what is
 * registered, and `check-api-contract.mjs` fails when the frontend calls a path
 * that is not. Neither says whether calling it *works* — and today three
 * endpoints were reachable, registered, contract-clean, and answered 500 or 503
 * because the service behind them was missing a dependency nobody had wired.
 *
 * This calls each one and insists on an answer below 500. Not a functional
 * test: a 401, a 403, a 404 for an id that does not exist are all fine. A 5xx
 * means the handler could not run at all, which is the failure that hides.
 */

test.use({ role: undefined })

const GOLDEN = join(__dirname, '../../apps/api/internal/router/testdata/routes.golden')

/** Ids that exist in the seeded database, for routes that need one. */
const SAMPLE: Record<string, string> = {
    ':id': '1',
    ':taskId': '00000000-0000-0000-0000-000000000001',
    ':planId': '00000000-0000-0000-0000-000000000001',
    ':reportId': '00000000-0000-0000-0000-000000000001',
    ':slug': 'nutrition',
    ':provider': 'yandex',
    ':date': '2026-01-01',
    ':category': 'main',
}

/** Which role should call a route, by the section of the API it lives in. */
function callerFor(path: string): 'client' | 'curator' | 'admin' {
    if (path.startsWith('/api/v1/admin')) return 'admin'
    if (path.startsWith('/api/v1/curator')) return 'curator'
    return 'client'
}

function readableRoutes(): { path: string; caller: 'client' | 'curator' | 'admin' }[] {
    return readFileSync(GOLDEN, 'utf8')
        .split('\n')
        .filter((line) => line.startsWith('GET '))
        .map((line) => line.slice(4).trim())
        .filter(Boolean)
        .map((path) => ({
            path: path.replace(/:[a-zA-Z]+/g, (param) => SAMPLE[param] ?? '1'),
            caller: callerFor(path),
        }))
}

test.describe('Every readable endpoint answers', () => {
    test('no registered GET route fails with a server error', async ({ browser, baseURL }) => {
        test.slow()

        const tokens: Record<string, string> = {}
        const contexts = []
        try {
            for (const role of ['client', 'curator', 'admin'] as const) {
                const context = await browser.newContext()
                contexts.push(context)
                tokens[role] = await signIn(context, baseURL!, role)
            }

            const request = contexts[0].request
            const broken: string[] = []

            for (const route of readableRoutes()) {
                const response = await request.get(`${baseURL}${route.path}`, {
                    headers: asUser(tokens[route.caller]),
                    failOnStatusCode: false,
                })
                if (response.status() >= 500) {
                    broken.push(
                        `${route.path} (as ${route.caller}) → ${response.status()}: ${(
                            await response.text()
                        ).slice(0, 160)}`
                    )
                }
            }

            expect(broken, `endpoints that could not run:\n${broken.join('\n')}`).toHaveLength(0)
        } finally {
            for (const context of contexts) await context.close()
        }
    })
})
