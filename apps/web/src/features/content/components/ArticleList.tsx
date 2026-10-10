'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { cn } from '@/shared/utils/cn'
import { contentApi } from '@/features/content/api/contentApi'
import { CATEGORY_LABELS } from '@/features/content/types'
import type { Article } from '@/features/content/types'
import { StatusBadge } from './StatusBadge'
import { isApiError, serverMessageFrom } from '@/shared/errors/apiErrors'
import { useConfirm } from '@/shared/components/ui'
import { Button, buttonBase, buttonSizes, buttonVariants } from '@/shared/components/ui/Button'
import { FileText } from 'lucide-react'

const STATUS_TABS = [
    { key: '', label: 'Все' },
    { key: 'draft', label: 'Черновики' },
    { key: 'scheduled', label: 'Запланированные' },
    { key: 'published', label: 'Опубликованные' },
] as const

interface ArticleListProps {
    basePath?: string
}

export function ArticleList({ basePath = '/curator/content' }: ArticleListProps) {
    const [articles, setArticles] = useState<Article[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [statusFilter, setStatusFilter] = useState('')
    const [categoryFilter] = useState('')
    const { confirm, dialog } = useConfirm()

    const fetchArticles = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const res = await contentApi.listArticles(
                statusFilter || undefined,
                categoryFilter || undefined,
            )
            setArticles(res.articles ?? [])
        } catch (err) {
            const msg = serverMessageFrom(err) || (err instanceof Error ? err.message : '') || 'Не удалось загрузить статьи'
            setError(`Ошибка: ${msg} (status: ${isApiError(err) ? err.status : 'unknown'})`)
            setArticles([])
        } finally {
            setLoading(false)
        }
    }, [statusFilter, categoryFilter])

    useEffect(() => {
        let cancelled = false

        // Inside the effect rather than run from its body: two setState calls
        // before the request even leaves render the list twice.
        async function load() {
            setLoading(true)
            setError(null)

            try {
                const res = await contentApi.listArticles(
                    statusFilter || undefined,
                    categoryFilter || undefined,
                )
                if (!cancelled) setArticles(res.articles ?? [])
            } catch (err) {
                console.error('[ArticleList] fetch error:', err)
                if (!cancelled) {
                    const error = err as { response?: { data?: { message?: string }; status?: number }; message?: string }
                    const msg = error?.response?.data?.message || error?.message || 'Не удалось загрузить статьи'
                    setError(`Ошибка: ${msg} (status: ${error?.response?.status ?? 'unknown'})`)
                    setArticles([])
                }
            } finally {
                if (!cancelled) setLoading(false)
            }
        }

        load()
        return () => { cancelled = true }
    }, [statusFilter, categoryFilter])

    const handleDelete = (id: string) => {
        // Раздел «Контент» пока не переведён (см. TRANSLATED в
        // scripts/check-i18n.mjs), поэтому строки здесь литеральные, как и
        // остальные в этом файле.
        confirm({
            title: 'Удалить статью?',
            description: 'Статья и её история изменений будут удалены без возможности восстановления.',
            confirmLabel: 'Удалить',
            onConfirm: async () => {
                setError(null)
                try {
                    await contentApi.deleteArticle(id)
                    await fetchArticles()
                } catch (err) {
                    setError(err instanceof Error ? err.message : 'Не удалось удалить статью')
                }
            },
        })
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
                className={cn(buttonBase, buttonVariants.primary, buttonSizes.lg, 'w-full')}
            >
                Создать статью
            </Link>

            {/* Filter tabs */}
            <div className="-mx-screen-x flex gap-2 overflow-x-auto px-screen-x pb-1 scrollbar-hide">
                {STATUS_TABS.map((tab) => (
                    <button
                        key={tab.key}
                        type="button"
                        onClick={() => setStatusFilter(tab.key)}
                        aria-pressed={statusFilter === tab.key}
                        className={cn(
                            'h-11 shrink-0 rounded-full px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                            statusFilter === tab.key
                                ? 'bg-fg text-fg-inverse'
                                : 'border border-line bg-surface text-fg-muted hover:bg-subtle',
                        )}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Error banner */}
            {error && (
                <div className="rounded-tile bg-danger-soft px-4 py-3 text-sm text-danger-fg" role="alert">
                    {error}
                </div>
            )}

            {/* Content */}
            {loading ? (
                <div className="flex justify-center py-12">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-primary" />
                </div>
            ) : articles.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-12 text-center">
                    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-subtle" aria-hidden="true">
                        <FileText className="h-6 w-6 text-fg-subtle" strokeWidth={1.8} />
                    </span>
                    <p className="type-title-3 text-fg">Статей пока нет</p>
                </div>
            ) : (
                <div className="grid gap-3">
                    {articles.map((article) => (
                        <div
                            key={article.id}
                            className="space-y-2 rounded-card border border-line bg-surface p-4"
                        >
                            <div className="flex items-start justify-between gap-2">
                                <h3 className="line-clamp-2 type-title-3 text-fg">
                                    {article.title}
                                </h3>
                                <StatusBadge status={article.status} />
                            </div>

                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-fg-muted">
                                {article.author_name && (
                                    <>
                                        <span>{article.author_name}</span>
                                        <span>&middot;</span>
                                    </>
                                )}
                                <span>{CATEGORY_LABELS[article.category]}</span>
                                <span>&middot;</span>
                                <span className="tabular-nums">
                                    {formatDate(article.published_at ?? article.created_at)}
                                </span>
                            </div>

                            {/* Статьи — общее пространство редакции: правит, публикует и
                                удаляет любой куратор и администратор, не только автор. */}
                            <div className="-mx-2 flex flex-wrap items-center gap-1 pt-1">
                                <Link
                                    href={`${basePath}/${article.id}/edit`}
                                    className={cn(buttonBase, buttonVariants.ghost, buttonSizes.md, 'px-3')}
                                >
                                    Редактировать
                                </Link>

                                {article.status === 'draft' && (
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        onClick={() => handlePublish(article.id)}
                                        className="px-3"
                                    >
                                        Опубликовать
                                    </Button>
                                )}

                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() => handleDelete(article.id)}
                                    className="px-3 text-danger-fg hover:bg-danger-soft"
                                >
                                    Удалить
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {dialog}
        </div>
    )
}
