'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { contentApi } from '@/features/content/api/contentApi'
import type {
    Article,
    CreateArticleRequest,
    UpdateArticleRequest,
} from '@/features/content/types'
import type { ParsedArticle } from '@/features/content/utils/parseFrontmatter'
import { parseArticleMarkdown } from '@/features/content/utils/parseFrontmatter'
import { ArticleForm } from './ArticleForm'
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

const TOOLBAR_ITEMS: { action: ToolbarAction; label: string; icon: string }[] = [
    { action: 'bold', label: 'Жирный', icon: 'B' },
    { action: 'italic', label: 'Курсив', icon: 'I' },
    { action: 'heading', label: 'Заголовок', icon: 'H' },
    { action: 'link', label: 'Ссылка', icon: '🔗' },
    { action: 'image', label: 'Изображение', icon: '🖼' },
]

// ============================================================================
// Markdown Preview Styles (reuse from ArticleView)
// ============================================================================

const PROSE_CLASSES =
    'prose max-w-none text-gray-800 text-sm [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mb-3 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mb-2 [&_p]:mb-3 [&_p]:leading-relaxed [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1 [&_a]:text-blue-600 [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-gray-300 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-gray-600 [&_blockquote]:mb-3 [&_img]:rounded-lg [&_img]:my-4 [&_code]:bg-gray-100 [&_code]:px-1 [&_code]:rounded [&_pre]:bg-gray-100 [&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre]:mb-3 [&_table]:w-full [&_table]:mb-3 [&_th]:border [&_th]:border-gray-300 [&_th]:px-3 [&_th]:py-1 [&_th]:bg-gray-50 [&_td]:border [&_td]:border-gray-300 [&_td]:px-3 [&_td]:py-1'

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

    return (
        <div
            className={`space-y-6 ${isDragging ? 'rounded-xl ring-2 ring-blue-400 ring-offset-2' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            {/* Drag & drop overlay */}
            {isDragging && (
                <div className="rounded-lg border-2 border-dashed border-blue-400 bg-blue-50 p-8 text-center text-sm text-blue-600">
                    Перетащите .md файл сюда
                </div>
            )}

            {/* Error banner */}
            {error && (
                <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
                    {error}
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
            <div className="rounded-lg border border-gray-200 bg-white p-4">
                <h2 className="mb-4 text-sm font-semibold text-gray-900">
                    Настройки статьи
                </h2>
                <ArticleForm
                    article={article}
                    importedData={importedData}
                    onSave={handleSave}
                    onPublish={article ? handlePublish : undefined}
                    onSchedule={article ? handleSchedule : undefined}
                    loading={loading}
                />
            </div>

            {/* Mobile tab toggle */}
            <div className="flex gap-1 rounded-lg bg-gray-100 p-1 md:hidden">
                <button
                    type="button"
                    onClick={() => setActiveTab('editor')}
                    className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                        activeTab === 'editor'
                            ? 'bg-white text-gray-900 shadow-sm'
                            : 'text-gray-500'
                    }`}
                >
                    Редактор
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab('preview')}
                    className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                        activeTab === 'preview'
                            ? 'bg-white text-gray-900 shadow-sm'
                            : 'text-gray-500'
                    }`}
                >
                    Превью
                </button>
            </div>

            {/* Editor + Preview layout */}
            <div className="grid gap-4 md:grid-cols-2">
                {/* Editor panel */}
                <div
                    className={`space-y-2 ${
                        activeTab !== 'editor' ? 'hidden md:block' : ''
                    }`}
                >
                    {/* Toolbar */}
                    <div className="flex gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1">
                        {TOOLBAR_ITEMS.map((item) => (
                            <button
                                key={item.action}
                                type="button"
                                onClick={() => handleToolbar(item.action)}
                                title={item.label}
                                className="rounded px-2 py-1 text-sm font-medium text-gray-600 transition-colors hover:bg-white hover:text-gray-900"
                            >
                                {item.icon}
                            </button>
                        ))}
                    </div>

                    {/* Textarea */}
                    <textarea
                        ref={textareaRef}
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        placeholder="Напишите статью в формате Markdown..."
                        className="h-96 w-full resize-y rounded-lg border border-gray-300 p-3 font-mono text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                </div>

                {/* Preview panel */}
                <div
                    className={`min-h-[24rem] rounded-lg border border-gray-200 p-4 ${
                        activeTab !== 'preview' ? 'hidden md:block' : ''
                    }`}
                >
                    <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400">
                        Превью
                    </p>
                    {body.trim() ? (
                        <div className={PROSE_CLASSES}>
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {body}
                            </ReactMarkdown>
                        </div>
                    ) : (
                        <p className="py-8 text-center text-sm text-gray-400">
                            Начните писать, чтобы увидеть превью
                        </p>
                    )}
                </div>
            </div>
        </div>
    )
}
