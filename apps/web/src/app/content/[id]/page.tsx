import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { JsonLd } from '@/shared/components/JsonLd'
import { EXPERT_AUTHOR } from '@/shared/constants/author'
import { openGraph } from '@/shared/constants/seo'
import { ArticleView } from '@/features/content/components/ArticleView'
import { ArticleContent } from '@/features/content/components/ArticleContent'
import { ArticleAuthor } from '@/features/content/components/ArticleAuthor'
import { ArticleCta } from '@/features/content/components/ArticleCta'
import { articleUrl, SITE_URL } from '@/features/content/utils/articlePath'
import type { Article } from '@/features/content/types'

const API_URL = process.env.INTERNAL_API_URL || 'http://api:4000'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The public article, or null when the public API does not have it.
 *
 * Throws when the API fails: a failure is not a missing article, and answering
 * "not found" for it would tell search engines to drop a page that exists.
 */
async function getPublicArticle(ref: string): Promise<Article | null> {
    // Not from a cache: with stale-while-revalidate the first reader after a
    // quiet spell — on this site, usually a crawler — got the article as it
    // was before the last edit. generateMetadata and the page make the same
    // request; Next runs it once per render.
    const res = await fetch(`${API_URL}/api/v1/public/content/${encodeURIComponent(ref)}`, {
        cache: 'no-store',
    })
    if (res.status === 404 || res.status === 400) return null
    if (!res.ok) throw new Error(`public article ${ref}: ${res.status}`)
    const data = await res.json()
    return data?.data ?? null
}

type PageProps = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { id } = await params
    const article = await getPublicArticle(id)

    if (!article) {
        // Either nobody can open this address, or it is an article only a
        // curator's clients may read. Neither belongs in search.
        return { title: 'Статья', robots: { index: false, follow: false } }
    }

    const url = articleUrl(article)
    return {
        title: article.title,
        description: article.excerpt || `${article.title} — статья на BURCEV`,
        authors: [{ name: EXPERT_AUTHOR.name, url: `${SITE_URL}${EXPERT_AUTHOR.path}` }],
        openGraph: openGraph({
            title: article.title,
            description: article.excerpt,
            url,
            type: 'article',
            publishedTime: article.published_at,
            modifiedTime: article.updated_at,
            authors: [`${SITE_URL}${EXPERT_AUTHOR.path}`],
            ...(article.cover_image_url && { images: [{ url: article.cover_image_url }] }),
        }),
        alternates: {
            canonical: url,
        },
    }
}

function authorJsonLd() {
    return {
        '@type': 'Person',
        name: EXPERT_AUTHOR.name,
        jobTitle: EXPERT_AUTHOR.jobTitle,
        url: `${SITE_URL}${EXPERT_AUTHOR.path}`,
        ...(EXPERT_AUTHOR.photo && { image: `${SITE_URL}${EXPERT_AUTHOR.photo}` }),
    }
}

export default async function ArticlePage({ params }: PageProps) {
    const { id } = await params
    const article = await getPublicArticle(id)

    if (!article) {
        // An article for one curator's clients is addressed by id and is not
        // in the public API; the signed-in reader gets it in the browser. A
        // slug is only ever public, so a slug nobody has is a real 404.
        if (UUID_PATTERN.test(id)) return <ArticleView articleId={id} />
        notFound()
    }

    const url = articleUrl(article)

    const articleJsonLd = {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: article.title,
        description: article.excerpt,
        datePublished: article.published_at,
        dateModified: article.updated_at,
        author: authorJsonLd(),
        publisher: {
            '@type': 'Organization',
            name: 'BURCEV',
            logo: { '@type': 'ImageObject', url: `${SITE_URL}/logo.svg` },
        },
        mainEntityOfPage: url,
        ...(article.cover_image_url && { image: article.cover_image_url }),
    }

    const breadcrumbsJsonLd = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Главная', item: SITE_URL },
            { '@type': 'ListItem', position: 2, name: 'Статьи', item: `${SITE_URL}/content` },
            { '@type': 'ListItem', position: 3, name: article.title, item: url },
        ],
    }

    return (
        <>
            <JsonLd data={articleJsonLd} />
            <JsonLd data={breadcrumbsJsonLd} />
            <ArticleContent article={article} byline={<ArticleAuthor author={EXPERT_AUTHOR} />}>
                <ArticleCta />
            </ArticleContent>
        </>
    )
}
