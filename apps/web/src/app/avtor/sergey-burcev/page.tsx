import type { Metadata } from 'next'
import Link from 'next/link'
import { JsonLd } from '@/shared/components/JsonLd'
import { EXPERT_AUTHOR } from '@/shared/constants/author'
import { ArticleAuthor } from '@/features/content/components/ArticleAuthor'
import { articlePath, SITE_URL } from '@/features/content/utils/articlePath'
import type { ArticleCard } from '@/features/content/types'

const API_URL = process.env.INTERNAL_API_URL || 'http://api:4000'
const PAGE_URL = `${SITE_URL}${EXPERT_AUTHOR.path}`

export const metadata: Metadata = {
    title: `${EXPERT_AUTHOR.name} — автор статей`,
    description: `${EXPERT_AUTHOR.name}: ${EXPERT_AUTHOR.jobTitle.toLowerCase()}. Статьи о питании, тренировках и подсчёте КБЖУ.`,
    alternates: { canonical: PAGE_URL },
    openGraph: {
        title: `${EXPERT_AUTHOR.name} — автор статей BURCEV`,
        url: PAGE_URL,
        type: 'profile',
    },
}

/**
 * The public articles, all of which he signs (see shared/constants/author.ts).
 * A failure leaves the list empty rather than the page broken: the page is
 * about the person first.
 */
async function getArticles(): Promise<ArticleCard[]> {
    try {
        const res = await fetch(`${API_URL}/api/v1/public/content?limit=100`, {
            cache: 'no-store',
        })
        if (!res.ok) return []
        const data = await res.json()
        return data?.data?.articles ?? []
    } catch {
        return []
    }
}

export default async function AuthorPage() {
    const articles = await getArticles()

    const profileJsonLd = {
        '@context': 'https://schema.org',
        '@type': 'ProfilePage',
        url: PAGE_URL,
        mainEntity: {
            '@type': 'Person',
            name: EXPERT_AUTHOR.name,
            jobTitle: EXPERT_AUTHOR.jobTitle,
            url: PAGE_URL,
            ...(EXPERT_AUTHOR.photo && { image: `${SITE_URL}${EXPERT_AUTHOR.photo}` }),
            worksFor: { '@type': 'Organization', name: 'BURCEV', url: SITE_URL },
        },
    }

    return (
        <main className="mx-auto max-w-3xl px-4 py-8">
            <JsonLd data={profileJsonLd} />

            <h1 className="mb-4 text-2xl font-bold text-fg">{EXPERT_AUTHOR.name}</h1>
            <ArticleAuthor author={EXPERT_AUTHOR} />

            {articles.length > 0 && (
                <section className="mt-10">
                    <h2 className="mb-4 text-lg font-semibold text-fg">Статьи</h2>
                    <ul className="space-y-3">
                        {articles.map((article) => (
                            <li key={article.id}>
                                <Link
                                    href={articlePath(article)}
                                    className="font-medium text-primary hover:underline"
                                >
                                    {article.title}
                                </Link>
                                {article.excerpt && (
                                    <p className="text-sm text-fg-muted">{article.excerpt}</p>
                                )}
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </main>
    )
}
