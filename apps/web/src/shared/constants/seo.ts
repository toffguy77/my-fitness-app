import type { Metadata } from 'next'

/**
 * The picture a shared link shows, drawn by app/opengraph-image.tsx.
 *
 * Next applies that file to the home page only. A page that declares its own
 * `openGraph` replaces the parent's block whole, images included, so every
 * public page names this one explicitly — otherwise /pricing, /content and the
 * calculator went out to Telegram and VK without a picture, and the pages that
 * inherited the layout's block pointed at /og-image.png, which never existed.
 */
export const SHARE_IMAGE = {
    url: '/opengraph-image',
    width: 1200,
    height: 630,
    alt: 'BURCEV — Фитнес и питание',
} as const

type OpenGraph = NonNullable<Metadata['openGraph']>

/** What every page's Open Graph carries unless it says otherwise. */
export const OPEN_GRAPH_BASE = {
    type: 'website',
    locale: 'ru_RU',
    siteName: 'BURCEV',
    images: [SHARE_IMAGE],
} as const

/**
 * A page's Open Graph block on top of the site's.
 *
 * Next does not merge `openGraph` with the layout's: a page that names a title
 * loses everything else. og:image was put back page by page, and og:type,
 * og:site_name and og:locale went missing the same way — Yandex's validator
 * reported the absent og:type as an error on / and /pricing. Building every
 * block here means a new page cannot lose them again.
 */
export function openGraph(page: OpenGraph): OpenGraph {
    return { ...OPEN_GRAPH_BASE, ...page } as OpenGraph
}
