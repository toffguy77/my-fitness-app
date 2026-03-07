'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { cn } from '@/shared/utils/cn'
import { contentApi } from '@/features/content/api/contentApi'
import { CATEGORY_LABELS } from '@/features/content/types'
import type { Article } from '@/features/content/types'
import { StatusBadge } from './StatusBadge'

const STATUS_TABS = [
    { key: '', label: 'Все' },
    { key: 'draft', label: 'Черновики' },
    { key: 'scheduled', label: 'Запланированные' },
    { key: 'published', label: 'Опубликованные' },
] as const

interface ArticleListProps {
    basePath?: string
    showAuthor?: boolean
}

export function ArticleList({ basePath = '/curator/content', showAuthor = false }: ArticleListProps) {
    const [articles, setArticles] = useState<Article[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [statusFilter, setStatusFilter] = useState('')
    const [categoryFilter] = useState('')

    const fetchArticles = useCallback(async () => {
        setLoading(true)
        try {
            const res = await contentApi.listArticles(
                statusFilter || undefined,
                categoryFilter || undefined,
            )
            setArticles(res.articles ?? [])
        } catch {
            setArticles([])
        } finally {
            setLoading(false)
        }
    }, [statusFilter, categoryFilter])

    useEffect(() => {
        let cancelled = false

        setLoading(true)
        contentApi
            .listArticles(
                statusFilter || undefined,
                categoryFilter || undefined,
            )
            .then((res) => {
                console.log('[ArticleList] API response:', JSON.stringify(res).slice(0, 500))
                console.log('[ArticleList] res.articles:', Array.isArray(res?.articles), 'length:', res?.articles?.length)
                if (!cancelled) setArticles(res.articles ?? [])
            })
            .catch((err) => {
                console.error('[ArticleList] fetch error:', err)
                if (!cancelled) setArticles([])
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })

        return () => {
            cancelled = true
        }
    }, [statusFilter, categoryFilter])

    const handleDelete = async (id: string) => {
        if (!window.confirm('Удалить статью?')) return
        setError(null)
        try {
            await contentApi.deleteArticle(id)
            await fetchArticles()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Не удалось удалить статью')
        }
    }

    const handlePublish = async (id: string) => {
        setError(null)
        try {
            await contentApi.publishArticle(id)
            await fetchArticles()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Не удалось опубликовать статью')
        }
    }

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('ru-RU', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
        })
    }

    return (
        <div className="space-y-4">
            {/* Create button */}
            <Link
                href={`${basePath}/new`}
                className="block w-full rounded-lg bg-gray-900 px-4 py-2.5 text-center text-sm font-medium text-white transition-colors hover:bg-gray-800"
            >
                Создать статью
            </Link>

            {/* Filter tabs */}
            <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                {STATUS_TABS.map((tab) => (
                    <button
                        key={tab.key}
                        type="button"
                        onClick={() => setStatusFilter(tab.key)}
                        className={cn(
                            'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                            statusFilter === tab.key
                                ? 'bg-gray-900 text-white'
                                : 'border border-gray-300 text-gray-600 hover:bg-gray-50',
                        )}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Error banner */}
            {error && (
                <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
                    {error}
                </div>
            )}

            {/* Content */}
            {loading ? (
                <div className="flex justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
                </div>
            ) : articles.length === 0 ? (
                <div className="text-center py-12">
                    <p className="text-sm text-gray-500">{showAuthor ? 'Статей пока нет' : 'У вас пока нет статей'}</p>
                </div>
            ) : (
                <div className="grid gap-3">
                    {articles.map((article) => (
                        <div
                            key={article.id}
                            className="rounded-xl border border-gray-200 bg-white p-4 space-y-2"
                        >
                            <div className="flex items-start justify-between gap-2">
                                <h3 className="text-sm font-semibold text-gray-900 line-clamp-2">
                                    {article.title}
                                </h3>
                                <StatusBadge status={article.status} />
                            </div>

                            <div className="flex items-center gap-2 text-xs text-gray-500">
                                {showAuthor && article.author_name && (
                                    <>
                                        <span>{article.author_name}</span>
                                        <span>&middot;</span>
                                    </>
                                )}
                                <span>{CATEGORY_LABELS[article.category]}</span>
                                <span>&middot;</span>
                                <span>
                                    {formatDate(article.published_at ?? article.created_at)}
                                </span>
                            </div>

                            <div className="flex items-center gap-2 pt-1">
                                <Link
                                    href={`${basePath}/${article.id}/edit`}
                                    className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 transition-colors"
                                >
                                    Редактировать
                                </Link>

                                {article.status === 'draft' && (
                                    <button
                                        type="button"
                                        onClick={() => handlePublish(article.id)}
                                        className="rounded-lg bg-green-100 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-200 transition-colors"
                                    >
                                        Опубликовать
                                    </button>
                                )}

                                <button
                                    type="button"
                                    onClick={() => handleDelete(article.id)}
                                    className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 transition-colors"
                                >
                                    Удалить
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
