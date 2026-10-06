export const SITE_URL = 'https://burcev.team'

interface Addressable {
    id: string
    slug?: string
}

/**
 * Where an article opens.
 *
 * By its slug when it has a public address. A card for an article meant only
 * for one curator's clients comes without one — its public page would not find
 * it — and is opened by id, which the page hands to the signed-in reader.
 */
export function articlePath(article: Addressable): string {
    return `/content/${article.slug || article.id}`
}

/** The absolute address, for canonical links, Open Graph and structured data. */
export function articleUrl(article: Addressable): string {
    return `${SITE_URL}${articlePath(article)}`
}
