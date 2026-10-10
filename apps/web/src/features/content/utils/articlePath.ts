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

/**
 * Where the editor returns after saving, when it was opened from an article.
 *
 * The address arrives in the query string, so only a page of our own article
 * is accepted — a slug or an id under /content/, nothing else. Anything wider
 * would let a link to the editor send somebody to another site after saving.
 */
export function articleReturnPath(from: string | null | undefined): string | null {
    if (!from) return null
    return /^\/content\/[A-Za-z0-9-]+$/.test(from) ? from : null
}

/**
 * The editor of an article for whoever may edit it, or null for anyone else.
 * Curators edit in their section and admins in theirs; both return to `from`.
 */
export function articleEditPath(role: string | undefined, articleId: string, from: string): string | null {
    const section = role === 'coordinator' ? '/curator' : role === 'super_admin' ? '/admin' : null
    if (!section) return null
    return `${section}/content/${articleId}/edit?from=${encodeURIComponent(from)}`
}
