import { PRIVATE_SECTIONS } from '@/shared/constants/sections'

/**
 * robots.txt, written out as text.
 *
 * It used to be app/robots.ts, but MetadataRoute.Robots has no field for
 * Clean-param, and Clean-param is the directive this file is now for.
 *
 * One block for every crawler, and nothing they ignore. There used to be a
 * second block for Yandex, there only to carry Crawl-delay; a crawler with its
 * own block ignores the general one, so the two lists of closed sections had
 * to be kept in step by hand. Yandex stopped reading Crawl-delay and Host in
 * 2018 (the crawl rate is set in Webmaster, the main mirror follows the 301),
 * and Google never read either.
 *
 * Everything not listed here is open: `Allow: /` covers the public pages, so a
 * new one does not need to be added anywhere.
 */

/**
 * Closed to crawlers: every private section (the same list proxy.ts guards, so
 * a new one cannot be forgotten here), and the pages that need no account but
 * have nothing to find.
 */
export const DISALLOW = [
    ...PRIVATE_SECTIONS,
    // Служебный справочник дизайн-системы — для команды, не для поиска.
    '/design-system',
    // The wizard: an app screen for two audiences, empty until the session is
    // known. The calculator page search should find is /kalkulyator-kbzhu.
    '/onboarding',
    '/forgot-password',
    '/reset-password',
    '/api/',
] as const

/**
 * Parameters that change nothing on the page — the ones the attribution code
 * reads from an ad or a mailing link. Yandex folds every address that differs
 * only by them into one and stops crawling the copies; canonical says the same
 * thing but only after the copy has been fetched. Google ignores the line.
 */
export const CLEAN_PARAMS = [
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_content',
    'utm_term',
    'yclid',
    'ysclid',
] as const

export const SITEMAP_URL = 'https://burcev.team/sitemap.xml'

export function robotsTxt(): string {
    return [
        'User-agent: *',
        'Allow: /',
        ...DISALLOW.map((path) => `Disallow: ${path}`),
        `Clean-param: ${CLEAN_PARAMS.join('&')}`,
        '',
        `Sitemap: ${SITEMAP_URL}`,
        '',
    ].join('\n')
}
