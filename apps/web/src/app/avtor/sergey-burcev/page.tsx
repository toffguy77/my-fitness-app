import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
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
        <main className="mx-auto max-w-content px-screen-x py-10 sm:py-14">
            <JsonLd data={profileJsonLd} />

            <h1 className="mb-6 type-display text-fg">{EXPERT_AUTHOR.name}</h1>
            <ArticleAuthor author={EXPERT_AUTHOR} zoomablePhoto />

            {articles.length > 0 && (
                <section className="mt-12">
                    <h2 className="mb-4 type-title-2 text-fg">Статьи</h2>
                    <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
                        {articles.map((article) => (
                            <li
                                key={article.id}
                                className="relative flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-subtle/60"
                            >
                                <div className="min-w-0 flex-1">
                                    {/* Растянутая ссылка: вся строка нажимается, а имя
                                        ссылки — только заголовок статьи. */}
                                    <Link
                                        href={articlePath(article)}
                                        className="block type-title-3 text-fg after:absolute after:inset-0 after:content-['']"
                                    >
                                        {article.title}
                                    </Link>
                                    {article.excerpt && (
                                        <p className="mt-1 text-sm text-fg-muted">{article.excerpt}</p>
                                    )}
                                </div>
                                <ChevronRight className="h-5 w-5 shrink-0 text-fg-subtle" strokeWidth={1.8} aria-hidden="true" />
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </main>
    )
}
