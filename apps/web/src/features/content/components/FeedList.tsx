'use client'

import { useEffect, useState, useCallback } from 'react'
import { BookOpen } from 'lucide-react'
import { Button } from '@/shared/components/ui/Button'
import { contentApi, publicContentApi } from '@/features/content/api/contentApi'
import { useSession } from '@/shared/hooks/useSession'
import { CategoryFilter } from './CategoryFilter'
import { FeedCard } from './FeedCard'
import type { ArticleCard } from '@/features/content/types'

const PAGE_SIZE = 20

/** What is on screen: which feed, and which category of it. */
function feedKey(source: 'personal' | 'public', category: string | null): string {
    return `${source}:${category ?? ''}`
}

export interface FeedListProps {
    /**
     * The first page of the public feed, fetched on the server so the links
     * are in the HTML a search engine reads. Shown as is; the browser asks
     * again only for something else — a category, or a signed-in reader's
     * own feed.
     */
    initialArticles?: ArticleCard[]
    initialTotal?: number
}

export function FeedList({ initialArticles, initialTotal }: FeedListProps = {}) {
    const [articles, setArticles] = useState<ArticleCard[]>(initialArticles ?? [])
    const [total, setTotal] = useState(initialTotal ?? initialArticles?.length ?? 0)
    const [loading, setLoading] = useState(initialArticles === undefined)
    const [shownKey, setShownKey] = useState<string | null>(
        initialArticles === undefined ? null : feedKey('public', null),
    )
    const [loadingMore, setLoadingMore] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [category, setCategory] = useState<string | null>(null)
    // Which endpoint to read from: the signed-in feed knows what has been read,
    // the public one does not. Waiting for the session to settle avoids asking
    // the public endpoint for somebody who has an account.
    const session = useSession()

    const fetchArticles = useCallback(
        async (cat: string | null, offset = 0) => {
            const api = session === 'authenticated' ? contentApi : publicContentApi
            return api.getFeed(cat ?? undefined, PAGE_SIZE, offset)
        },
        [session]
    )

    const wantedKey = feedKey(session === 'authenticated' ? 'personal' : 'public', category)

    useEffect(() => {
        // Already on screen — the server's first page, while the session is
        // still being restored or turns out to be a guest's.
        if (wantedKey === shownKey) return

        let cancelled = false

        // The whole load, including clearing the previous category's articles,
        // lives in one function inside the effect: run straight from the effect
        // body those three calls render twice before the request even leaves.
        async function load() {
            setArticles([])
            setLoading(true)
            setError(null)

            try {
                const res = await fetchArticles(category)
                if (cancelled) return
                setArticles(res.articles)
                setTotal(res.total)
                setShownKey(wantedKey)
            } catch (err) {
                if (cancelled) return
                setArticles([])
                setTotal(0)
                setError(err instanceof Error ? err.message : 'Не удалось загрузить ленту')
            } finally {
                if (!cancelled) setLoading(false)
            }
        }

        load()
        return () => { cancelled = true }
    }, [category, fetchArticles, wantedKey, shownKey])

    const handleLoadMore = async () => {
        setLoadingMore(true)
        try {
            const res = await fetchArticles(category, articles.length)
            setArticles((prev) => [...prev, ...res.articles])
            setTotal(res.total)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Не удалось загрузить ещё')
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

            {error && (
                <div className="rounded-tile bg-danger-soft px-4 py-3 text-sm text-danger-fg" role="alert">
                    {error}
                </div>
            )}

            {loading ? (
                <div className="flex justify-center py-12">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-primary" />
                </div>
            ) : articles.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-12 text-center">
                    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-subtle" aria-hidden="true">
                        <BookOpen className="h-6 w-6 text-fg-subtle" strokeWidth={1.8} />
                    </span>
                    <p className="type-title-3 text-fg">Пока нет контента</p>
                </div>
            ) : (
                <>
                    <div className="grid gap-4 sm:grid-cols-2">
                        {articles.map((article) => (
                            <FeedCard key={article.id} article={article} />
                        ))}
                    </div>

                    {total > articles.length && (
                        <div className="flex justify-center pt-2">
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={handleLoadMore}
                                disabled={loadingMore}
                            >
                                {loadingMore ? 'Загрузка...' : 'Загрузить ещё'}
                            </Button>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}
