import type { ReactNode } from 'react'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ArrowLeft } from 'lucide-react'
import { CATEGORY_LABELS } from '@/features/content/types'
import type { Article } from '@/features/content/types'

/**
 * The layout of an article, wherever it is rendered.
 *
 * No 'use client': the public page renders this on the server, so the text is
 * in the HTML a search engine reads, and ArticleView renders it in the browser
 * for articles only a signed-in client may open. One component, so the two
 * cannot drift apart.
 */
export interface ArticleContentProps {
    article: Pick<Article, 'title' | 'category' | 'published_at' | 'body'>
    /** Who wrote it — the expert on public pages, the curator's name otherwise. */
    byline: ReactNode
    /** What follows the body, such as the call to action. */
    children?: ReactNode
}

export function ArticleContent({ article, byline, children }: ArticleContentProps) {
    const publishedDate = article.published_at
        ? new Date(article.published_at).toLocaleDateString('ru-RU', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
          })
        : null

    return (
        <article className="mx-auto max-w-3xl px-4 py-6">
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

            <h1 className="mb-3 text-2xl font-bold text-gray-900">
                {article.title}
            </h1>

            <div className="mb-5 space-y-2 text-sm text-gray-500">
                {byline}
                {publishedDate && <p>{publishedDate}</p>}
            </div>

            <hr className="mb-6 border-gray-200" />

            <div className="prose max-w-none text-gray-800 [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mb-3 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mb-2 [&_p]:mb-3 [&_p]:leading-relaxed [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1 [&_a]:text-blue-600 [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-gray-300 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-gray-600 [&_blockquote]:mb-3 [&_img]:rounded-lg [&_img]:my-4 [&_code]:bg-gray-100 [&_code]:px-1 [&_code]:rounded [&_pre]:bg-gray-100 [&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre]:mb-3 [&_table]:w-full [&_table]:mb-3 [&_th]:border [&_th]:border-gray-300 [&_th]:px-3 [&_th]:py-1 [&_th]:bg-gray-50 [&_td]:border [&_td]:border-gray-300 [&_td]:px-3 [&_td]:py-1">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {article.body ?? ''}
                </ReactMarkdown>
            </div>

            {children}
        </article>
    )
}
