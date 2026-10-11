/** @jest-environment node */
import { appleAppSiteAssociation, APP_LINK_PATHS, IOS_APP_ID } from './association'
import { GET } from './route'

describe('apple-app-site-association', () => {
    it('claims only the sign-in links from email for the iOS app', () => {
        const details = appleAppSiteAssociation().applinks.details
        expect(details).toHaveLength(1)
        expect(details[0].appIDs).toEqual([IOS_APP_ID])
        expect(details[0].components.map((c) => c['/'])).toEqual([...APP_LINK_PATHS])
    })

    it('does not claim the OAuth link confirmation or unsubscribe pages', () => {
        const paths = appleAppSiteAssociation().applinks.details[0].components.map((c) => c['/'])
        expect(paths).not.toContain('/auth/link')
        expect(paths.some((p) => p.includes('unsubscribe'))).toBe(false)
    })

    it('is served as JSON', async () => {
        const response = GET()
        expect(response.headers.get('content-type')).toContain('application/json')
        expect((await response.json()).applinks.details[0].appIDs).toEqual([IOS_APP_ID])
    })
})
