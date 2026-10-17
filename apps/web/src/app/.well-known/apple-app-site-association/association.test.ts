/** @jest-environment node */
import { appID, appleAppSiteAssociation, APP_LINK_PATHS } from './association'
import { GET } from './route'

const ID = 'TEAM123456.team.burcev.app'

function withEnv(env: Record<string, string | undefined>, run: () => void | Promise<void>) {
    const saved = { APPLE_TEAM_ID: process.env.APPLE_TEAM_ID, APPLE_BUNDLE_ID: process.env.APPLE_BUNDLE_ID }
    Object.assign(process.env, env)
    for (const [key, value] of Object.entries(env)) if (value === undefined) delete process.env[key]
    return Promise.resolve(run()).finally(() => {
        for (const [key, value] of Object.entries(saved)) {
            if (value === undefined) delete process.env[key]
            else process.env[key] = value
        }
    })
}

describe('apple-app-site-association', () => {
    it('builds the app id from APPLE_TEAM_ID and APPLE_BUNDLE_ID', () => {
        expect(appID({ APPLE_TEAM_ID: 'TEAM123456', APPLE_BUNDLE_ID: 'team.burcev.app' })).toBe(ID)
        expect(appID({ APPLE_TEAM_ID: 'TEAM123456' })).toBeNull()
        expect(appID({ APPLE_BUNDLE_ID: 'team.burcev.app' })).toBeNull()
        expect(appID({ APPLE_TEAM_ID: ' ', APPLE_BUNDLE_ID: 'team.burcev.app' })).toBeNull()
    })

    it('opens exactly the paths of the design, exclusions first', () => {
        const components = appleAppSiteAssociation(ID).applinks.details[0].components
        expect(components.slice(0, 2)).toEqual([
            expect.objectContaining({ '/': '/api/*', exclude: true }),
            expect.objectContaining({ '/': '/unsubscribe*', exclude: true }),
        ])
        expect(components.slice(2).map((c) => c['/'])).toEqual([...APP_LINK_PATHS])
        expect(components.slice(2).every((c) => !c.exclude)).toBe(true)
        expect(APP_LINK_PATHS).toEqual([
            '/auth/link/consume*',
            '/auth/native-complete*',
            '/reset-password*',
            '/content/*',
            '/dashboard*',
            '/food-tracker*',
            '/chat*',
            '/notifications*',
            '/curator/*',
        ])
    })

    it('names the same app for applinks and webcredentials', () => {
        const aasa = appleAppSiteAssociation(ID)
        expect(aasa.applinks.details[0].appIDs).toEqual([ID])
        expect(aasa.webcredentials.apps).toEqual([ID])
    })

    it('is served as uncached JSON with the configured app id', () =>
        withEnv({ APPLE_TEAM_ID: 'TEAM123456', APPLE_BUNDLE_ID: 'team.burcev.app' }, async () => {
            const response = GET()
            expect(response.status).toBe(200)
            expect(response.headers.get('content-type')).toBe('application/json')
            expect(response.headers.get('cache-control')).toBe('no-store')
            expect(response.headers.get('location')).toBeNull()
            const body = await response.json()
            expect(body.applinks.details[0].appIDs).toEqual([ID])
            const paths = body.applinks.details[0].components.map((c: { '/': string }) => c['/'])
            expect(paths).toContain('/auth/link/consume*')
        }))

    it('answers 404 when the app is not configured', () =>
        withEnv({ APPLE_TEAM_ID: undefined, APPLE_BUNDLE_ID: 'team.burcev.app' }, () => {
            expect(GET().status).toBe(404)
        }))
})
