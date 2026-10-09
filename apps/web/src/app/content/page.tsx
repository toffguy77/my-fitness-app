import type { Metadata } from 'next'
import { FeedList } from '@/features/content/components/FeedList'
import type { FeedResponse } from '@/features/content/types'
import { SHARE_IMAGE } from '@/shared/constants/seo'

export const metadata: Metadata = {
    title: 'Статьи о фитнесе и питании',
    description:
        'Полезные статьи о правильном питании, тренировках, рецептах и здоровом образе жизни от экспертов BURCEV.',
    openGraph: {
        title: 'Статьи о фитнесе и питании | BURCEV',
        description: 'Полезные статьи о правильном питании, тренировках и здоровом образе жизни.',
        url: 'https://burcev.team/content',
        images: [SHARE_IMAGE],
    },
    alternates: {
        canonical: 'https://burcev.team/content',
    },
}

const API_URL = process.env.INTERNAL_API_URL || 'http://api:4000'

/** The feed's page size; FeedList asks for the same when it loads more. */
const FIRST_PAGE = 20

/**
 * The first page of the public feed, for the HTML a search engine reads.
 * Undefined when the API cannot answer: the list then loads in the browser,
 * as it did before, rather than the page failing.
 */
async function getFirstPage(): Promise<FeedResponse | undefined> {
    try {
        // Not from a cache: with stale-while-revalidate the first visitor after
        // a quiet spell — usually a crawler — got the feed without the article
        // published in between.
        const res = await fetch(`${API_URL}/api/v1/public/content?limit=${FIRST_PAGE}&offset=0`, {
            cache: 'no-store',
        })
        if (!res.ok) return undefined
        const data = await res.json()
        return data?.data
    } catch {
        return undefined
    }
}

export default async function ContentFeedPage() {
    const firstPage = await getFirstPage()

    return (
        <div className="mx-auto w-full max-w-content px-screen-x py-5 pb-20">
            <h1 className="mb-4 type-title-1 text-fg">Статьи</h1>
            <FeedList
                {...(firstPage && {
                    initialArticles: firstPage.articles,
                    initialTotal: firstPage.total,
                })}
            />
        </div>
    )
}
