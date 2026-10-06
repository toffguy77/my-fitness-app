import type { MetadataRoute } from 'next'
import { articleUrl, SITE_URL } from '@/features/content/utils/articlePath'
import { EXPERT_AUTHOR } from '@/shared/constants/author'

const API_URL = process.env.INTERNAL_API_URL || 'http://api:4000'

/**
 * Built per request, not at `next build`.
 *
 * As a static route the sitemap was rendered once inside the image build,
 * where the API is not reachable: every deploy shipped a sitemap without a
 * single article, and it stayed that way until the next deploy.
 */
export const dynamic = 'force-dynamic'

/** One page of the public feed; the API trims anything larger to this. */
const PAGE_SIZE = 100
/** A guard against an API that never says it is done: 5 000 articles. */
const MAX_PAGES = 50
/** How long one page of the feed may take before the sitemap goes without. */
const ARTICLE_FETCH_TIMEOUT_MS = 5000

interface FeedCard {
    id: string
    slug?: string
    published_at?: string
    updated_at?: string
}

/*
 * No lastModified on these: "now" on every request tells a crawler that
 * everything changes all the time, and it stops trusting the field.
 */
const STATIC_PAGES: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: 'weekly', priority: 1.0 },
    // Единственная страница, где сказано, что продаётся, — значит
    // приоритет сразу за посадочной.
    { url: `${SITE_URL}/pricing`, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${SITE_URL}/kalkulyator-kbzhu`, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${SITE_URL}/content`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${SITE_URL}${EXPERT_AUTHOR.path}`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE_URL}/legal/terms`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/legal/privacy`, changeFrequency: 'yearly', priority: 0.3 },
]

async function publicArticles(): Promise<FeedCard[]> {
    const articles: FeedCard[] = []
    for (let page = 0; page < MAX_PAGES; page++) {
        const res = await fetch(
            `${API_URL}/api/v1/public/content?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`,
            {
                // A crawler does not need to cost the API a query every time.
                next: { revalidate: 300 },
                signal: AbortSignal.timeout(ARTICLE_FETCH_TIMEOUT_MS),
            },
        )
        if (!res.ok) throw new Error(`public feed answered ${res.status}`)

        const data = await res.json()
        const batch: FeedCard[] = data?.data?.articles ?? []
        const total: number = data?.data?.total ?? 0
        articles.push(...batch)

        if (batch.length < PAGE_SIZE || articles.length >= total) break
    }
    return articles
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    let articles: FeedCard[] = []
    try {
        articles = await publicArticles()
    } catch (err) {
        // The static pages are still a correct sitemap — but a sitemap that
        // silently lost its articles is how this went unnoticed before.
        console.error('sitemap: public articles unavailable', err)
    }

    const articlePages: MetadataRoute.Sitemap = articles.map((article) => {
        const changed = article.updated_at ?? article.published_at
        return {
            url: articleUrl(article),
            ...(changed && { lastModified: new Date(changed) }),
            changeFrequency: 'monthly' as const,
            priority: 0.6,
        }
    })

    return [...STATIC_PAGES, ...articlePages]
}
