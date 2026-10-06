import type { MetadataRoute } from 'next'

/**
 * One block for every crawler, and nothing they ignore.
 *
 * There used to be a second block for Yandex, there only to carry
 * Crawl-delay; a crawler with its own block ignores the general one, so the
 * two lists of closed sections had to be kept in step by hand. Yandex stopped
 * reading Crawl-delay and Host in 2018 (the crawl rate is set in Webmaster, the
 * main mirror follows the 301), and Google never read either.
 *
 * Everything not listed here is open: `Allow: /` covers the public pages, so a
 * new one does not need to be added anywhere.
 */
export default function robots(): MetadataRoute.Robots {
    return {
        rules: {
            userAgent: '*',
            allow: '/',
            disallow: [
                '/dashboard',
                '/food-tracker',
                '/notifications',
                '/profile',
                '/settings',
                '/chat',
                '/curator',
                '/admin',
                // The wizard: an app screen for two audiences, empty until the
                // session is known. The calculator page search should find is
                // /kalkulyator-kbzhu.
                '/onboarding',
                '/forgot-password',
                '/reset-password',
                '/api/',
            ],
        },
        sitemap: 'https://burcev.team/sitemap.xml',
    }
}
