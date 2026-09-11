import { test, expect, signIn, asUser } from '../fixtures/session'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A curator addressing somebody else's client.
 *
 * Row-level security was enabled by migration 004 and turned off by 015, so
 * nothing in the database stands between two curators. Every route carrying a
 * client id is guarded by one middleware, and the registry in
 * `authorization_matrix_test.go` fails the build when a new one forgets it —
 * but neither proves the guard actually refuses. This asks.
 *
 * The target is real: the first curator's own client, addressed by a curator
 * who has none.
 */

test.use({ role: undefined })

const GOLDEN = join(__dirname, '../../apps/api/internal/router/testdata/routes.golden')

/** Every readable route that names a client id. */
function clientScopedRoutes(): string[] {
    return readFileSync(GOLDEN, 'utf8')
        .split('\n')
        .filter((line) => line.startsWith('GET /api/v1/curator/clients/:id'))
        .map((line) => line.slice(4).trim())
}

test.describe('One curator, another curator’s client', () => {
    test('is refused on every route that names a client', async ({ browser, baseURL }) => {
        const owner = await browser.newContext()
        const stranger = await browser.newContext()

        try {
            const ownerToken = await signIn(owner, baseURL!, 'curator')
            const strangerToken = await signIn(stranger, baseURL!, 'other-curator')

            const roster = await owner.request.get(`${baseURL}/api/v1/curator/clients`, {
                headers: asUser(ownerToken),
            })
            const clients = (await roster.json()).data ?? []
            expect(clients.length, 'the first curator has no client to guard').toBeGreaterThan(0)
            const clientId = clients[0].id

            // The stranger sees nobody, which is the other half of the same
            // guarantee: not just refused, but not even listed.
            const strangerRoster = await stranger.request.get(`${baseURL}/api/v1/curator/clients`, {
                headers: asUser(strangerToken),
            })
            expect((await strangerRoster.json()).data ?? []).toHaveLength(0)

            const allowed: string[] = []
            for (const route of clientScopedRoutes()) {
                const path = route
                    .replace(':id', String(clientId))
                    .replace(/:[a-zA-Z]+/g, '00000000-0000-0000-0000-000000000001')

                const response = await stranger.request.get(`${baseURL}${path}`, {
                    headers: asUser(strangerToken),
                    failOnStatusCode: false,
                })

                // 403 is the answer. A 404 would also keep the data private but
                // says something different; anything 2xx is a leak.
                if (response.status() < 400) {
                    allowed.push(`${path} → ${response.status()}`)
                }
            }

            expect(
                allowed,
                `a curator reached another curator's client:\n${allowed.join('\n')}`
            ).toHaveLength(0)
        } finally {
            await owner.close()
            await stranger.close()
        }
    })

    test('a client cannot read the curator section at all', async ({ browser, baseURL }) => {
        const context = await browser.newContext()
        try {
            const token = await signIn(context, baseURL!, 'client')
            const response = await context.request.get(`${baseURL}/api/v1/curator/clients`, {
                headers: asUser(token),
                failOnStatusCode: false,
            })

            expect(response.status()).toBe(403)
        } finally {
            await context.close()
        }
    })
})
