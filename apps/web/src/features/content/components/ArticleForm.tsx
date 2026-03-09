'use client'

import { useState, useEffect } from 'react'
import { AudienceSelector } from './AudienceSelector'
import {
    CATEGORY_LABELS,
    type Article,
    type ContentCategory,
    type AudienceScope,
    type CreateArticleRequest,
    type UpdateArticleRequest,
} from '@/features/content/types'

// ============================================================================
// Types
// ============================================================================

interface ArticleFormProps {
    article?: Article
    onSave: (data: CreateArticleRequest | UpdateArticleRequest, body?: string) => void
    onPublish?: () => void
    onSchedule?: (scheduledAt: string) => void
    loading?: boolean
}

// ============================================================================
// Constants
// ============================================================================

const categories = Object.keys(CATEGORY_LABELS) as ContentCategory[]

// ============================================================================
// Component
// ============================================================================

export function ArticleForm({
    article,
    onSave,
    onPublish,
    onSchedule,
    loading,
}: ArticleFormProps) {
    const [title, setTitle] = useState(article?.title ?? '')
    const [excerpt, setExcerpt] = useState(article?.excerpt ?? '')
    const [category, setCategory] = useState<ContentCategory>(
        article?.category ?? 'general'
    )
    const [audienceScope, setAudienceScope] = useState<AudienceScope>(
        article?.audience_scope ?? 'all'
    )
    const [clientIds, setClientIds] = useState<number[]>([])
    const [coverImageUrl, setCoverImageUrl] = useState(
        article?.cover_image_url ?? ''
    )
    const [scheduledAt, setScheduledAt] = useState(
        article?.scheduled_at
            ? article.scheduled_at.slice(0, 16) // format for datetime-local
            : ''
    )

    // Sync with article prop changes (e.g. after initial load)
    const articleId = article?.id
    const articleTitle = article?.title
    const articleExcerpt = article?.excerpt
    const articleCategory = article?.category
    const articleAudienceScope = article?.audience_scope
    const articleCoverImageUrl = article?.cover_image_url
    const articleScheduledAt = article?.scheduled_at

    /* eslint-disable react-hooks/set-state-in-effect */
    useEffect(() => {
        if (articleId != null) {
            setTitle(articleTitle ?? '')
            setExcerpt(articleExcerpt ?? '')
            setCategory(articleCategory ?? 'general')
            setAudienceScope(articleAudienceScope ?? 'all')
            setCoverImageUrl(articleCoverImageUrl ?? '')
            if (articleScheduledAt) {
                setScheduledAt(articleScheduledAt.slice(0, 16))
            }
        }
    }, [articleId, articleTitle, articleExcerpt, articleCategory, articleAudienceScope, articleCoverImageUrl, articleScheduledAt])
    /* eslint-enable react-hooks/set-state-in-effect */

    function handleSave() {
        if (!title.trim()) return

        if (article) {
            const data: UpdateArticleRequest = {
                title: title.trim(),
                excerpt: excerpt.trim() || undefined,
                category,
                audience_scope: audienceScope,
                cover_image_url: coverImageUrl.trim() || undefined,
                client_ids: audienceScope === 'selected' ? clientIds : undefined,
            }
            onSave(data)
        } else {
            const data: CreateArticleRequest = {
                title: title.trim(),
                excerpt: excerpt.trim() || undefined,
                category,
                audience_scope: audienceScope,
                client_ids: audienceScope === 'selected' ? clientIds : undefined,
                cover_image_url: coverImageUrl.trim() || undefined,
            }
            onSave(data)
        }
    }

    function handleSchedule() {
        if (scheduledAt && onSchedule) {
            onSchedule(new Date(scheduledAt).toISOString())
        }
    }

    const isDraft = !article || article.status === 'draft'

    return (
        <div className="space-y-4">
            {/* Title */}
            <div>
                <label
                    htmlFor="article-title"
                    className="mb-1 block text-sm font-medium text-gray-700"
                >
                    Заголовок <span className="text-red-500">*</span>
                </label>
                <input
                    id="article-title"
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Введите заголовок статьи"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
            </div>

            {/* Excerpt */}
            <div>
                <label
                    htmlFor="article-excerpt"
                    className="mb-1 block text-sm font-medium text-gray-700"
                >
                    Краткое описание
                </label>
                <textarea
                    id="article-excerpt"
                    value={excerpt}
                    onChange={(e) => setExcerpt(e.target.value)}
                    placeholder="Краткое описание статьи"
                    rows={2}
                    className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
            </div>

            {/* Category */}
            <div>
                <label
                    htmlFor="article-category"
                    className="mb-1 block text-sm font-medium text-gray-700"
                >
                    Категория
                </label>
                <select
                    id="article-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value as ContentCategory)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                    {categories.map((cat) => (
                        <option key={cat} value={cat}>
                            {CATEGORY_LABELS[cat]}
                        </option>
                    ))}
                </select>
            </div>

            {/* Audience */}
            <AudienceSelector
                value={audienceScope}
                onChange={setAudienceScope}
                clientIds={clientIds}
                onClientIdsChange={setClientIds}
            />

            {/* Cover image URL */}
            <div>
                <label
                    htmlFor="article-cover"
                    className="mb-1 block text-sm font-medium text-gray-700"
                >
                    URL обложки
                </label>
                <input
                    id="article-cover"
                    type="text"
                    value={coverImageUrl}
                    onChange={(e) => setCoverImageUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
            </div>

            {/* Schedule datetime (draft only) */}
            {isDraft && (
                <div>
                    <label
                        htmlFor="article-schedule"
                        className="mb-1 block text-sm font-medium text-gray-700"
                    >
                        Запланировать публикацию
                    </label>
                    <input
                        id="article-schedule"
                        type="datetime-local"
                        value={scheduledAt}
                        onChange={(e) => setScheduledAt(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                </div>
            )}

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2 pt-2">
                <button
                    type="button"
                    onClick={handleSave}
                    disabled={loading || !title.trim()}
                    className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-50"
                >
                    {loading ? 'Сохранение...' : isDraft ? 'Сохранить черновик' : 'Сохранить'}
                </button>

                {article && isDraft && onPublish && (
                    <button
                        type="button"
                        onClick={onPublish}
                        disabled={loading}
                        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                    >
                        Опубликовать
                    </button>
                )}

                {isDraft && scheduledAt && onSchedule && (
                    <button
                        type="button"
                        onClick={handleSchedule}
                        disabled={loading}
                        className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
                    >
                        Запланировать
                    </button>
                )}
            </div>
        </div>
    )
}
