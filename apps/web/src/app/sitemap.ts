import type { MetadataRoute } from 'next'

const SITE_URL = 'https://burcev.team'
const API_URL = process.env.INTERNAL_API_URL || 'http://api:4000'

/** How long the build waits for the article list before shipping without it. */
const ARTICLE_FETCH_TIMEOUT_MS = 5000

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const staticPages: MetadataRoute.Sitemap = [
        {
            url: SITE_URL,
            lastModified: new Date(),
            changeFrequency: 'weekly',
            priority: 1.0,
        },
        {
            url: `${SITE_URL}/auth`,
            lastModified: new Date(),
            changeFrequency: 'monthly',
            priority: 0.5,
        },
        {
            url: `${SITE_URL}/content`,
            lastModified: new Date(),
            changeFrequency: 'daily',
            priority: 0.8,
        },
        {
            url: `${SITE_URL}/legal/terms`,
            lastModified: new Date(),
            changeFrequency: 'yearly',
            priority: 0.3,
        },
        {
            url: `${SITE_URL}/legal/privacy`,
            lastModified: new Date(),
            changeFrequency: 'yearly',
            priority: 0.3,
        },
    ]

    let articlePages: MetadataRoute.Sitemap = []
    try {
        // Bounded on purpose. This runs at build time, where the API may not be
        // reachable under the name this environment uses: without a deadline
        // the request hangs until Next's own 60-second page timeout, three
        // times over, and then fails the whole build over a list of articles
        // the sitemap can do without.
        const res = await fetch(`${API_URL}/api/v1/public/content?limit=1000`, {
            next: { revalidate: 3600 },
            signal: AbortSignal.timeout(ARTICLE_FETCH_TIMEOUT_MS),
        })
        if (res.ok) {
            const data = await res.json()
            const articles = data?.data?.articles || []
            articlePages = articles.map(
                (article: { id: string; published_at?: string }) => ({
                    url: `${SITE_URL}/content/${article.id}`,
                    lastModified: article.published_at
                        ? new Date(article.published_at)
                        : new Date(),
                    changeFrequency: 'monthly' as const,
                    priority: 0.6,
                }),
            )
        }
    } catch {
        // Unreachable, slow or refusing: a sitemap of the static pages is a
        // correct sitemap, and a failed build is not.
    }

    return [...staticPages, ...articlePages]
}
