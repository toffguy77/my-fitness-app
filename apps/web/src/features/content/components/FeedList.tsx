'use client'

import { useEffect, useState, useCallback } from 'react'
import { contentApi } from '@/features/content/api/contentApi'
import { CategoryFilter } from './CategoryFilter'
import { FeedCard } from './FeedCard'
import type { ArticleCard } from '@/features/content/types'

const PAGE_SIZE = 20

export function FeedList() {
    const [articles, setArticles] = useState<ArticleCard[]>([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(true)
    const [loadingMore, setLoadingMore] = useState(false)
    const [category, setCategory] = useState<string | null>(null)

    const fetchArticles = useCallback(async (cat: string | null, offset = 0) => {
        const res = await contentApi.getFeed(cat ?? undefined, PAGE_SIZE, offset)
        return res
    }, [])

    useEffect(() => {
        let cancelled = false
        setLoading(true)

        fetchArticles(category)
            .then((res) => {
                if (!cancelled) {
                    setArticles(res.articles)
                    setTotal(res.total)
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setArticles([])
                    setTotal(0)
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })

        return () => { cancelled = true }
    }, [category, fetchArticles])

    const handleLoadMore = async () => {
        setLoadingMore(true)
        try {
            const res = await fetchArticles(category, articles.length)
            setArticles((prev) => [...prev, ...res.articles])
            setTotal(res.total)
        } catch {
            // ignore
        } finally {
            setLoadingMore(false)
        }
    }

    const handleCategoryChange = (cat: string | null) => {
        setCategory(cat)
    }

    return (
        <div className="space-y-4">
            <CategoryFilter selected={category} onSelect={handleCategoryChange} />

            {loading ? (
                <div className="flex justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
                </div>
            ) : articles.length === 0 ? (
                <div className="text-center py-12">
                    <p className="text-sm text-gray-500">Пока нет контента</p>
                </div>
            ) : (
                <>
                    <div className="grid gap-4">
                        {articles.map((article) => (
                            <FeedCard key={article.id} article={article} />
                        ))}
                    </div>

                    {total > articles.length && (
                        <div className="flex justify-center pt-2">
                            <button
                                type="button"
                                onClick={handleLoadMore}
                                disabled={loadingMore}
                                className="rounded-lg bg-gray-100 px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 transition-colors disabled:opacity-50"
                            >
                                {loadingMore ? 'Загрузка...' : 'Загрузить ещё'}
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}
