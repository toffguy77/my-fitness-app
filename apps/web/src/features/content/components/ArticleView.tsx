'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { contentApi, publicContentApi } from '@/features/content/api/contentApi'
import { ArticleContent } from './ArticleContent'
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
            <div className="flex items-center justify-center py-20">
                <svg
                    className="h-6 w-6 animate-spin text-blue-600"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                >
                    <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                    />
                    <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                </svg>
            </div>
        )
    }

    // Error state
    if (error || !article) {
        return (
            <div className="px-4 py-6">
                <Link
                    href="/content"
                    className="mb-4 inline-flex items-center gap-1 text-sm text-blue-600"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Назад
                </Link>
                <div className="rounded-lg bg-red-50 p-4 text-center text-red-600">
                    {error || 'Статья не найдена'}
                </div>
            </div>
        )
    }

    return (
        <ArticleContent
            article={article}
            byline={article.author_name ? <p>{article.author_name}</p> : null}
        />
    )
}
