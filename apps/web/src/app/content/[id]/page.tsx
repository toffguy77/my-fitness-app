import type { Metadata } from 'next'
import { JsonLd } from '@/shared/components/JsonLd'
import { ArticleView } from '@/features/content/components/ArticleView'

const API_URL = process.env.INTERNAL_API_URL || 'http://api:4000'

async function getPublicArticle(id: string) {
    try {
        const res = await fetch(`${API_URL}/api/v1/public/content/${id}`, {
            next: { revalidate: 3600 },
        })
        if (!res.ok) return null
        const data = await res.json()
        return data?.data || null
    } catch {
        return null
    }
}

export async function generateMetadata({
    params,
}: {
    params: Promise<{ id: string }>
}): Promise<Metadata> {
    const { id } = await params
    const article = await getPublicArticle(id)

    if (!article) {
        return { title: 'Статья не найдена' }
    }

    return {
        title: article.title,
        description: article.excerpt || `${article.title} — статья на BURCEV`,
        openGraph: {
            title: article.title,
            description: article.excerpt,
            url: `https://burcev.team/content/${id}`,
            type: 'article',
            publishedTime: article.published_at,
            ...(article.cover_image_url && {
                images: [{ url: article.cover_image_url }],
            }),
        },
        alternates: {
            canonical: `https://burcev.team/content/${id}`,
        },
    }
}

export default async function ArticlePage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = await params
    const article = await getPublicArticle(id)

    const articleJsonLd = article
        ? {
              '@context': 'https://schema.org',
              '@type': 'Article',
              headline: article.title,
              description: article.excerpt,
              datePublished: article.published_at,
              dateModified: article.updated_at,
              author: { '@type': 'Organization', name: 'BURCEV' },
              publisher: {
                  '@type': 'Organization',
                  name: 'BURCEV',
                  logo: { '@type': 'ImageObject', url: 'https://burcev.team/logo.svg' },
              },
              mainEntityOfPage: `https://burcev.team/content/${id}`,
              ...(article.cover_image_url && { image: article.cover_image_url }),
          }
        : null

    return (
        <>
            {articleJsonLd && <JsonLd data={articleJsonLd} />}
            <ArticleView articleId={id} />
        </>
    )
}
