'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ArrowLeft } from 'lucide-react'
import { contentApi, publicContentApi } from '@/features/content/api/contentApi'
import { CATEGORY_LABELS } from '@/features/content/types'
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

    const publishedDate = article.published_at
        ? new Date(article.published_at).toLocaleDateString('ru-RU', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
          })
        : null

    return (
        <div className="px-4 py-6">
            {/* Back button + Category badge */}
            <div className="mb-4 flex items-center gap-3">
                <Link
                    href="/content"
                    className="inline-flex items-center gap-1 text-sm text-blue-600"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Назад
                </Link>

                <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700">
                    {CATEGORY_LABELS[article.category] ?? article.category}
                </span>
            </div>

            {/* Title */}
            <h1 className="mb-3 text-2xl font-bold text-gray-900">
                {article.title}
            </h1>

            {/* Author and date */}
            <p className="mb-5 text-sm text-gray-500">
                {article.author_name}
                {publishedDate && <> &middot; {publishedDate}</>}
            </p>

            {/* Separator */}
            <hr className="mb-6 border-gray-200" />

            {/* Markdown body */}
            <div className="prose max-w-none text-gray-800 [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mb-3 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mb-2 [&_p]:mb-3 [&_p]:leading-relaxed [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1 [&_a]:text-blue-600 [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-gray-300 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-gray-600 [&_blockquote]:mb-3 [&_img]:rounded-lg [&_img]:my-4 [&_code]:bg-gray-100 [&_code]:px-1 [&_code]:rounded [&_pre]:bg-gray-100 [&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre]:mb-3 [&_table]:w-full [&_table]:mb-3 [&_th]:border [&_th]:border-gray-300 [&_th]:px-3 [&_th]:py-1 [&_th]:bg-gray-50 [&_td]:border [&_td]:border-gray-300 [&_td]:px-3 [&_td]:py-1">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {article.body ?? ''}
                </ReactMarkdown>
            </div>
        </div>
    )
}
