'use client'

import { useState, useEffect, useRef } from 'react'
import { AudienceSelector } from './AudienceSelector'
import {
    CATEGORY_LABELS,
    type Article,
    type ContentCategory,
    type AudienceScope,
    type CreateArticleRequest,
    type UpdateArticleRequest,
} from '@/features/content/types'
import type { ParsedArticle } from '@/features/content/utils/parseFrontmatter'
import { contentApi } from '@/features/content/api/contentApi'

// ============================================================================
// Types
// ============================================================================

interface ArticleFormProps {
    article?: Article
    importedData?: ParsedArticle
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
    importedData,
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
    const [coverImageError, setCoverImageError] = useState('')
    const [coverUploading, setCoverUploading] = useState(false)
    const coverInputRef = useRef<HTMLInputElement>(null)

    async function handleCoverFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return
        setCoverImageError('')
        setCoverUploading(true)
        try {
            const result = await contentApi.uploadCoverImage(file)
            setCoverImageUrl(result.url)
        } catch {
            setCoverImageError('Не удалось загрузить изображение. Попробуйте ещё раз.')
        } finally {
            setCoverUploading(false)
            if (coverInputRef.current) coverInputRef.current.value = ''
        }
    }
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

    // Apply imported frontmatter data
    /* eslint-disable react-hooks/set-state-in-effect */
    useEffect(() => {
        if (!importedData) return
        if (importedData.title) setTitle(importedData.title)
        if (importedData.excerpt) setExcerpt(importedData.excerpt)
        if (importedData.category) setCategory(importedData.category)
        if (importedData.audience) setAudienceScope(importedData.audience)
        if (importedData.coverUrl) setCoverImageUrl(importedData.coverUrl)
    }, [importedData])
    /* eslint-enable react-hooks/set-state-in-effect */

    function handleSave() {
        if (!title.trim()) return

        const trimmedCover = coverImageUrl.trim()
        if (trimmedCover && !trimmedCover.startsWith('https://storage.yandexcloud.net/')) {
            setCoverImageError('Изображение должно быть загружено через наш сервис')
            return
        }
        setCoverImageError('')

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

            {/* Cover image upload */}
            <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                    Обложка
                </label>

                {coverImageUrl ? (
                    <div className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={coverImageUrl}
                            alt="Превью обложки"
                            className="h-40 w-full rounded-lg border border-gray-200 object-cover"
                            onError={(e) => { e.currentTarget.style.display = 'none' }}
                        />
                        <button
                            type="button"
                            onClick={() => coverInputRef.current?.click()}
                            disabled={coverUploading}
                            className="absolute bottom-2 right-2 rounded-lg bg-white/90 px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm border border-gray-200 hover:bg-white disabled:opacity-50"
                        >
                            {coverUploading ? 'Загрузка...' : 'Заменить'}
                        </button>
                        <button
                            type="button"
                            onClick={() => setCoverImageUrl('')}
                            disabled={coverUploading}
                            className="absolute top-2 right-2 rounded-full bg-white/90 p-1 text-gray-500 shadow-sm border border-gray-200 hover:text-red-600 disabled:opacity-50"
                            aria-label="Удалить обложку"
                        >
                            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                        </button>
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={() => coverInputRef.current?.click()}
                        disabled={coverUploading}
                        className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 py-8 text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 disabled:opacity-50"
                    >
                        {coverUploading ? (
                            <span>Загрузка...</span>
                        ) : (
                            <>
                                <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                <span>Загрузить изображение обложки</span>
                                <span className="text-xs text-gray-400">JPEG, PNG, WebP · до 10 МБ</span>
                            </>
                        )}
                    </button>
                )}

                <input
                    ref={coverInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handleCoverFileChange}
                />

                {coverImageError && (
                    <p className="mt-1 text-xs text-red-600">{coverImageError}</p>
                )}
            </div>

            {/* Audience */}
            <AudienceSelector
                value={audienceScope}
                onChange={setAudienceScope}
                clientIds={clientIds}
                onClientIdsChange={setClientIds}
            />

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
