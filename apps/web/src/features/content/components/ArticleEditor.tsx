'use client'

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { contentApi } from '@/features/content/api/contentApi'
import type {
    Article,
    CreateArticleRequest,
    UpdateArticleRequest,
} from '@/features/content/types'
import type { ParsedArticle } from '@/features/content/utils/parseFrontmatter'
import { parseArticleMarkdown } from '@/features/content/utils/parseFrontmatter'
import {
    AlertCircle,
    Bold,
    FileUp,
    Heading2,
    Image as ImageIcon,
    Italic,
    Link2,
    type LucideIcon,
} from 'lucide-react'
import { Card, CardHeader } from '@/shared/components/ui/Card'
import { IconButton } from '@/shared/components/ui/Button'
import { cn } from '@/shared/utils/cn'
import { EXPERT_AUTHOR } from '@/shared/constants/author'
import { ArticleForm, type ArticleDraft } from './ArticleForm'
import { ArticleAuthor } from './ArticleAuthor'
import { ArticleContent } from './ArticleContent'
import { FileUploader } from './FileUploader'
import { MediaUploader } from './MediaUploader'

// ============================================================================
// Types
// ============================================================================

interface ArticleEditorProps {
    articleId?: string
    returnPath?: string
}

type ToolbarAction = 'bold' | 'italic' | 'heading' | 'link' | 'image'

// ============================================================================
// Helpers
// ============================================================================

function insertMarkdown(
    textarea: HTMLTextAreaElement,
    action: ToolbarAction
): string {
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const text = textarea.value
    const selected = text.slice(start, end) || 'текст'

    const templates: Record<ToolbarAction, { before: string; after: string; placeholder: string }> = {
        bold: { before: '**', after: '**', placeholder: 'текст' },
        italic: { before: '*', after: '*', placeholder: 'текст' },
        heading: { before: '## ', after: '', placeholder: 'Заголовок' },
        link: { before: '[', after: '](url)', placeholder: 'текст' },
        image: { before: '![', after: '](url)', placeholder: 'описание' },
    }

    const t = templates[action]
    const replacement = `${t.before}${selected || t.placeholder}${t.after}`
    return text.slice(0, start) + replacement + text.slice(end)
}

// ============================================================================
// Toolbar Button
// ============================================================================

const TOOLBAR_ITEMS: { action: ToolbarAction; label: string; icon: LucideIcon }[] = [
    { action: 'bold', label: 'Жирный', icon: Bold },
    { action: 'italic', label: 'Курсив', icon: Italic },
    { action: 'heading', label: 'Заголовок', icon: Heading2 },
    { action: 'link', label: 'Ссылка', icon: Link2 },
    { action: 'image', label: 'Изображение', icon: ImageIcon },
]

// ============================================================================
// Component
// ============================================================================

export function ArticleEditor({ articleId, returnPath = '/curator/content' }: ArticleEditorProps) {
    const router = useRouter()
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    const [article, setArticle] = useState<Article | undefined>(undefined)
    const [body, setBody] = useState('')
    const [loading, setLoading] = useState(false)
    const [fetching, setFetching] = useState(!!articleId)
    const [error, setError] = useState<string | null>(null)
    const [activeTab, setActiveTab] = useState<'editor' | 'preview'>('editor')
    const [importedData, setImportedData] = useState<ParsedArticle | undefined>(undefined)
    // The form's fields as they are now, unsaved — what the preview shows.
    const [draft, setDraft] = useState<ArticleDraft | null>(null)
    const [isDragging, setIsDragging] = useState(false)

    // Fetch article for editing
    useEffect(() => {
        if (!articleId) return
        let cancelled = false

        async function fetchArticle() {
            try {
                setFetching(true)
                const data = await contentApi.getArticle(articleId!)
                if (!cancelled) {
                    setArticle(data)
                    setBody(data.body ?? '')
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
                if (!cancelled) setFetching(false)
            }
        }

        fetchArticle()
        return () => { cancelled = true }
    }, [articleId])

    // The field grows with the text, so the page scrolls instead of a box
    // inside it. Measured after every change and when the tab comes back.
    useLayoutEffect(() => {
        const textarea = textareaRef.current
        if (!textarea || activeTab !== 'editor') return
        textarea.style.height = 'auto'
        // scrollHeight covers the padding but not the border.
        textarea.style.height = `${textarea.scrollHeight + textarea.offsetHeight - textarea.clientHeight}px`
    }, [body, activeTab, fetching])

    // Toolbar click handler
    const handleToolbar = useCallback((action: ToolbarAction) => {
        const textarea = textareaRef.current
        if (!textarea) return
        const newValue = insertMarkdown(textarea, action)
        setBody(newValue)
        textarea.focus()
    }, [])

    // Save handler
    async function handleSave(data: CreateArticleRequest | UpdateArticleRequest) {
        setLoading(true)
        setError(null)

        try {
            if (article) {
                // Editing existing article
                await contentApi.updateArticle(article.id, {
                    ...data,
                    body,
                } as UpdateArticleRequest)
            } else {
                // Creating new article — send body in single request
                await contentApi.createArticle({
                    ...data,
                    body: body.trim() ? body : undefined,
                } as CreateArticleRequest)
            }
            router.push(returnPath)
        } catch (err) {
            setError(
                err instanceof Error ? err.message : 'Ошибка сохранения'
            )
        } finally {
            setLoading(false)
        }
    }

    // Publish handler
    async function handlePublish() {
        if (!article) return
        setLoading(true)
        setError(null)

        try {
            // Save body first
            await contentApi.updateArticle(article.id, { body })
            await contentApi.publishArticle(article.id)
            router.push(returnPath)
        } catch (err) {
            setError(
                err instanceof Error ? err.message : 'Ошибка публикации'
            )
        } finally {
            setLoading(false)
        }
    }

    // Schedule handler
    async function handleSchedule(scheduledAt: string) {
        if (!article) return
        setLoading(true)
        setError(null)

        try {
            // Save body first
            await contentApi.updateArticle(article.id, { body })
            await contentApi.scheduleArticle(article.id, { scheduled_at: scheduledAt })
            router.push(returnPath)
        } catch (err) {
            setError(
                err instanceof Error ? err.message : 'Ошибка планирования'
            )
        } finally {
            setLoading(false)
        }
    }

    // Drag & drop handlers
    function handleDragOver(e: React.DragEvent) {
        e.preventDefault()
        setIsDragging(true)
    }

    function handleDragLeave(e: React.DragEvent) {
        e.preventDefault()
        setIsDragging(false)
    }

    function handleDrop(e: React.DragEvent) {
        e.preventDefault()
        setIsDragging(false)

        const file = e.dataTransfer.files[0]
        if (!file || !file.name.match(/\.(md|markdown)$/i)) return

        const reader = new FileReader()
        reader.onload = () => {
            const content = reader.result as string
            const parsed = parseArticleMarkdown(content)
            handleFileImport(parsed)
        }
        reader.readAsText(file)
    }

    // File import handler
    function handleFileImport(parsed: ParsedArticle) {
        setBody(parsed.body)
        setImportedData(parsed)
    }

    // Media upload handler
    function handleMediaUpload(url: string) {
        setBody((prev) => prev + `\n![изображение](${url})\n`)
    }

    // Loading state
    if (fetching) {
        return (
            <div className="flex items-center justify-center py-20" role="status">
                <span
                    className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-primary"
                    aria-hidden="true"
                />
            </div>
        )
    }

    return (
        <div
            className={cn('space-y-5', isDragging && 'rounded-card ring-2 ring-focus ring-offset-2')}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            {/* Drag & drop overlay */}
            {isDragging && (
                <div className="flex flex-col items-center gap-2 rounded-card border-2 border-dashed border-line-strong bg-subtle p-8 text-center text-[15px] text-fg-muted">
                    <FileUp className="h-6 w-6" strokeWidth={1.8} aria-hidden="true" />
                    Перетащите .md файл сюда
                </div>
            )}

            {/* Error banner */}
            {error && (
                <div className="flex items-start gap-2 rounded-tile bg-danger-soft px-4 py-3 text-sm text-danger-fg" role="alert">
                    <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" strokeWidth={1.8} aria-hidden="true" />
                    <span>{error}</span>
                </div>
            )}

            {/* File import + media upload */}
            <div className="flex flex-wrap items-center gap-3">
                <FileUploader onFileLoaded={(parsed) => handleFileImport(parsed)} />
                {article && (
                    <MediaUploader
                        articleId={article.id}
                        onUpload={handleMediaUpload}
                    />
                )}
            </div>

            {/* Article form (metadata + actions) */}
            <Card>
                <CardHeader>
                    <h2 className="type-title-3 text-fg">
                        Настройки статьи
                    </h2>
                </CardHeader>
                <ArticleForm
                    article={article}
                    importedData={importedData}
                    onDraftChange={setDraft}
                    onSave={handleSave}
                    onPublish={article ? handlePublish : undefined}
                    onSchedule={article ? handleSchedule : undefined}
                    loading={loading}
                />
            </Card>

            {/* Текст и превью — вкладки на всю ширину на любом экране: две
                колонки в узкой странице не давали ни писать, ни читать. */}
            <div className="flex gap-1 rounded-full border border-line p-1" role="tablist" aria-label="Текст или превью">
                {([
                    ['editor', 'Текст'],
                    ['preview', 'Превью'],
                ] as const).map(([tab, label]) => (
                    <button
                        key={tab}
                        type="button"
                        role="tab"
                        id={`article-tab-${tab}`}
                        aria-controls={`article-panel-${tab}`}
                        aria-selected={activeTab === tab}
                        onClick={() => setActiveTab(tab)}
                        className={cn(
                            'h-10 flex-1 rounded-full px-3 text-sm font-semibold transition-colors duration-150',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                            activeTab === tab ? 'bg-fg text-fg-inverse' : 'text-fg-muted hover:text-fg'
                        )}
                    >
                        {label}
                    </button>
                ))}
            </div>

            <div
                id="article-panel-editor"
                role="tabpanel"
                aria-labelledby="article-tab-editor"
                hidden={activeTab !== 'editor'}
                className="space-y-2"
            >
                {/* Toolbar */}
                <div className="flex gap-1 rounded-tile border border-line bg-surface p-1" role="toolbar" aria-label="Форматирование">
                    {TOOLBAR_ITEMS.map((item) => {
                        const Icon = item.icon
                        return (
                            <IconButton
                                key={item.action}
                                variant="ghost"
                                onClick={() => handleToolbar(item.action)}
                                title={item.label}
                                aria-label={item.label}
                                className="rounded-field"
                            >
                                <Icon className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden="true" />
                            </IconButton>
                        )
                    })}
                </div>

                {/* Растёт вместе с текстом; шрифт — как у текста статьи. */}
                <textarea
                    ref={textareaRef}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Напишите статью в формате Markdown..."
                    className="min-h-96 w-full resize-none overflow-hidden rounded-field border border-line bg-surface px-4 py-3 text-[17px] leading-[28px] text-fg placeholder:text-fg-subtle transition-colors focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-focus/30"
                />
            </div>

            {activeTab === 'preview' && (
                <div
                    id="article-panel-preview"
                    role="tabpanel"
                    aria-labelledby="article-tab-preview"
                    className="rounded-card border border-line bg-canvas"
                >
                    {/* Та же страница статьи, что увидит читатель: публичная
                        подписана экспертом, личная — именем куратора. */}
                    <ArticleContent
                        article={{
                            title: (draft?.title ?? article?.title ?? '').trim() || 'Без заголовка',
                            category: draft?.category ?? article?.category ?? 'general',
                            cover_image_url: draft?.cover_image_url ?? article?.cover_image_url,
                            published_at: article?.published_at,
                            body,
                        }}
                        byline={
                            (draft?.audience_scope ?? article?.audience_scope ?? 'all') === 'all'
                                ? <ArticleAuthor author={EXPERT_AUTHOR} />
                                : article?.author_name ? <p>{article.author_name}</p> : null
                        }
                        backLink={false}
                    />
                </div>
            )}
        </div>
    )
}
