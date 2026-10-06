'use client'

import { useState, useEffect, useRef } from 'react'
import { CalendarClock, ImagePlus, X } from 'lucide-react'
import { Button, IconButton } from '@/shared/components/ui/Button'
import { cn } from '@/shared/utils/cn'
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
import { messageForOr } from '@/shared/errors/apiErrors'

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

/**
 * Поле по рецепту системы: 48 px, текст 16 px (iOS не масштабирует страницу
 * при фокусе), поверхность с линией, фокус — кольцом и линией чернилами.
 */
const FIELD =
    'w-full rounded-field border border-line bg-surface px-4 text-base text-fg placeholder:text-fg-subtle ' +
    'transition-colors focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-focus/30 ' +
    'disabled:cursor-not-allowed disabled:bg-subtle disabled:text-fg-muted'

const LABEL = 'mb-1.5 block text-sm font-medium text-fg-muted'

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
    // Left empty for a new article, the server makes the address from the title.
    const [slug, setSlug] = useState(article?.slug ?? '')
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
        } catch (err) {
            // «Попробуйте ещё раз» не поможет, когда сервер сказал «такой файл
            // загрузить нельзя» или «хранилище не настроено».
            setCoverImageError(messageForOr(err, 'Не удалось загрузить изображение. Попробуйте ещё раз.'))
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

        const chosenSlug = slug.trim()
        if (article) {
            const data: UpdateArticleRequest = {
                ...(chosenSlug && chosenSlug !== article.slug && { slug: chosenSlug }),
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
                ...(chosenSlug && { slug: chosenSlug }),
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
    const canPublish = !!(article && isDraft && onPublish)

    return (
        <div className="space-y-4">
            {/* Category */}
            <div>
                <label
                    htmlFor="article-category"
                    className={LABEL}
                >
                    Категория
                </label>
                <select
                    id="article-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value as ContentCategory)}
                    className={cn(FIELD, 'h-12')}
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
                    className={LABEL}
                >
                    Заголовок <span className="text-danger-fg">*</span>
                </label>
                <input
                    id="article-title"
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Введите заголовок статьи"
                    className={cn(FIELD, 'h-12')}
                />
            </div>

            {/* Address */}
            <div>
                <label
                    htmlFor="article-slug"
                    className={LABEL}
                >
                    Адрес статьи
                </label>
                <div className="flex items-center gap-2 text-base text-fg-muted">
                    <span className="shrink-0">/content/</span>
                    <input
                        id="article-slug"
                        type="text"
                        value={slug}
                        onChange={(e) => setSlug(e.target.value.toLowerCase())}
                        disabled={article?.status === 'published'}
                        placeholder="сформируется из заголовка"
                        pattern="[a-z0-9]+(-[a-z0-9]+)*"
                        maxLength={80}
                        className={cn(FIELD, 'h-12')}
                    />
                </div>
                <p className="mt-1.5 type-caption text-fg-muted">
                    {article?.status === 'published'
                        ? 'Адрес опубликованной статьи не меняется: он уже в ссылках и в поиске.'
                        : 'Латинские буквы, цифры и дефисы. После публикации адрес не меняется.'}
                </p>
            </div>

            {/* Excerpt */}
            <div>
                <label
                    htmlFor="article-excerpt"
                    className={LABEL}
                >
                    Краткое описание
                </label>
                <textarea
                    id="article-excerpt"
                    value={excerpt}
                    onChange={(e) => setExcerpt(e.target.value)}
                    placeholder="Краткое описание статьи"
                    rows={2}
                    className={cn(FIELD, 'resize-none py-3')}
                />
            </div>

            {/* Cover image upload */}
            <div>
                <p className={LABEL}>
                    Обложка
                </p>

                {coverImageUrl ? (
                    <div className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={coverImageUrl}
                            alt="Превью обложки"
                            className="h-40 w-full rounded-tile border border-line object-cover"
                            onError={(e) => { e.currentTarget.style.display = 'none' }}
                        />
                        {/* Кнопки лежат поверх изображения — на подложке
                            поверхности, чтобы читаться на любой картинке. */}
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => coverInputRef.current?.click()}
                            disabled={coverUploading}
                            className="absolute bottom-2 right-2 bg-surface hover:bg-surface"
                        >
                            {coverUploading ? 'Загрузка...' : 'Заменить'}
                        </Button>
                        <IconButton
                            type="button"
                            variant="subtle"
                            onClick={() => setCoverImageUrl('')}
                            disabled={coverUploading}
                            className="absolute right-2 top-2 bg-surface hover:bg-surface hover:text-danger-fg"
                            aria-label="Удалить обложку"
                        >
                            <X className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
                        </IconButton>
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={() => coverInputRef.current?.click()}
                        disabled={coverUploading}
                        className="flex w-full flex-col items-center justify-center gap-2 rounded-tile border-2 border-dashed border-line py-8 text-[15px] text-fg-muted transition-colors hover:border-line-strong hover:bg-subtle hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-50"
                    >
                        {coverUploading ? (
                            <span className="flex items-center gap-2">
                                <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-primary" aria-hidden="true" />
                                Загрузка...
                            </span>
                        ) : (
                            <>
                                <ImagePlus className="h-7 w-7" strokeWidth={1.6} aria-hidden="true" />
                                <span>Загрузить изображение обложки</span>
                                <span className="type-caption text-fg-subtle">JPEG, PNG, WebP · до 10 МБ</span>
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
                    <p className="mt-1.5 text-sm text-danger-fg" role="alert">{coverImageError}</p>
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
                        className={LABEL}
                    >
                        Запланировать публикацию
                    </label>
                    <input
                        id="article-schedule"
                        type="datetime-local"
                        value={scheduledAt}
                        onChange={(e) => setScheduledAt(e.target.value)}
                        className={cn(FIELD, 'h-12 tabular-nums')}
                    />
                </div>
            )}

            {/* Action buttons.
                Одно главное действие: у черновика, который уже сохранён, —
                «Опубликовать», иначе — сохранение. Остальные — контуром. */}
            <div className="flex flex-wrap gap-2 pt-2">
                <Button
                    type="button"
                    variant={canPublish ? 'secondary' : 'primary'}
                    size="lg"
                    onClick={handleSave}
                    disabled={loading || !title.trim()}
                >
                    {loading ? 'Сохранение...' : isDraft ? 'Сохранить черновик' : 'Сохранить'}
                </Button>

                {canPublish && (
                    <Button
                        type="button"
                        variant="primary"
                        size="lg"
                        onClick={onPublish}
                        disabled={loading}
                    >
                        Опубликовать
                    </Button>
                )}

                {isDraft && scheduledAt && onSchedule && (
                    <Button
                        type="button"
                        variant="secondary"
                        size="lg"
                        onClick={handleSchedule}
                        disabled={loading}
                    >
                        <CalendarClock className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                        Запланировать
                    </Button>
                )}
            </div>
        </div>
    )
}
