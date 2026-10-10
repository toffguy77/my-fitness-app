'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { AlertCircle, ArrowLeft } from 'lucide-react'
import { contentApi, publicContentApi } from '@/features/content/api/contentApi'
import { ArticleContent } from './ArticleContent'
import { ArticleEditLink } from './ArticleEditLink'
import type { Article } from '@/features/content/types'

// ============================================================================
// Types
// ============================================================================

interface ArticleViewProps {
    articleId: string
}

// ============================================================================
// Component
// ============================================================================

export function ArticleView({ articleId }: ArticleViewProps) {
    const [article, setArticle] = useState<Article | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let cancelled = false

        async function fetchArticle() {
            try {
                setLoading(true)
                setError(null)
                let data: Article
                try {
                    data = await contentApi.getFeedArticle(articleId)
                } catch {
                    // Fallback to public API if authenticated request fails
                    data = await publicContentApi.getArticle(articleId)
                }
                if (!cancelled) {
                    setArticle(data)
                }
            } catch (err) {
                if (!cancelled) {
                    setError(
                        err instanceof Error
                            ? err.message
                            : 'Не удалось загрузить статью'
                    )
                }
            } finally {
                if (!cancelled) {
                    setLoading(false)
                }
            }
        }

        fetchArticle()
        return () => { cancelled = true }
    }, [articleId])

    // Loading state
    if (loading) {
        return (
            <div className="flex items-center justify-center py-20" role="status">
                <span
                    className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-primary"
                    aria-hidden="true"
                />
            </div>
        )
    }

    // Error state
    if (error || !article) {
        return (
            <div className="mx-auto w-full max-w-content px-screen-x py-5">
                <Link
                    href="/content"
                    className="-ml-2 mb-4 inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-[15px] font-semibold text-fg-muted transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                    <ArrowLeft className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                    Назад
                </Link>
                <div className="flex items-start gap-3 rounded-card bg-danger-soft p-5 text-danger-fg" role="alert">
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" strokeWidth={1.8} aria-hidden="true" />
                    <p className="text-[15px]">{error || 'Статья не найдена'}</p>
                </div>
            </div>
        )
    }

    return (
        <ArticleContent
            article={article}
            byline={article.author_name ? <p>{article.author_name}</p> : null}
            actions={<ArticleEditLink articleId={article.id} from={`/content/${articleId}`} />}
        />
    )
}
