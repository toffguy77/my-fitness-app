/**
 * The redirect from the retired /admin/leads and /admin/support pages.
 *
 * This is the only thing left to prove about the redirect: that it exists,
 * that it is permanent (308, so a browser and a search engine stop asking
 * for the old address), and that it points at the new page. The role check
 * itself is not this file's job — it lives in apps/web/src/app/curator/layout.tsx
 * and is covered in src/app/__tests__/layouts.test.tsx; a redirect carries no
 * decision of its own to test here.
 */
import nextConfig from '../next.config'

describe('the retired /admin/leads and /admin/support addresses', () => {
    it('redirects both, permanently, to their curator addresses', async () => {
        const redirects = await nextConfig.redirects?.()

        expect(redirects).toEqual(
            expect.arrayContaining([
                { source: '/admin/leads', destination: '/curator/leads', permanent: true },
                { source: '/admin/support', destination: '/curator/support', permanent: true },
            ])
        )
    })

    it('defines nothing beyond those two', async () => {
        const redirects = await nextConfig.redirects?.()

        expect(redirects).toHaveLength(2)
    })
})
