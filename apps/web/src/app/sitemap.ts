import type { MetadataRoute } from 'next'

const SITE_URL = 'https://burcev.team'
const API_URL = process.env.INTERNAL_API_URL || 'http://api:4000'

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
        const res = await fetch(`${API_URL}/api/v1/public/content?limit=1000`, {
            next: { revalidate: 3600 },
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
        // Continue with static-only sitemap if API is unavailable
    }

    return [...staticPages, ...articlePages]
}
