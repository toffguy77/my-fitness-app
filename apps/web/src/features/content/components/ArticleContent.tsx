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

    // Экран чтения: колонка контента, заголовок засечками, текст 17/28 —
    // длинное чтение с телефона без усталости. Категория — нейтральной
    // меткой: она опознаёт тему, а не зовёт к действию.
    return (
        <article className="mx-auto w-full max-w-content px-screen-x py-5">
            {/* Back button + Category badge */}
            <div className="mb-4 flex items-center justify-between gap-3">
                <Link
                    href="/content"
                    className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-[15px] font-semibold text-fg-muted transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                    <ArrowLeft className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                    Назад
                </Link>

                <span className="rounded-full bg-subtle px-3 py-1 text-xs font-medium text-fg-muted">
                    {CATEGORY_LABELS[article.category] ?? article.category}
                </span>
            </div>

            <h1 className="mb-4 type-title-1 text-fg">
                {article.title}
            </h1>

            <div className="mb-6 space-y-2 text-sm text-fg-muted">
                {byline}
                {publishedDate && <p className="tabular-nums">{publishedDate}</p>}
            </div>

            <hr className="mb-6 border-line" />

            <div className="max-w-none text-[17px] leading-[28px] text-fg [&_h1]:type-title-2 [&_h1]:mb-3 [&_h1]:mt-8 [&_h2]:type-title-2 [&_h2]:mb-3 [&_h2]:mt-8 [&_h3]:type-title-3 [&_h3]:mb-2 [&_h3]:mt-6 [&_h4]:type-headline [&_h4]:mb-2 [&_h4]:mt-5 [&_p]:mb-4 [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:mb-1.5 [&_li]:pl-1 [&_strong]:font-semibold [&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:my-6 [&_blockquote]:border-l-2 [&_blockquote]:border-line-strong [&_blockquote]:pl-5 [&_blockquote]:type-quote [&_blockquote]:text-fg-muted [&_hr]:my-8 [&_hr]:border-line [&_img]:my-6 [&_img]:rounded-tile [&_code]:rounded [&_code]:bg-subtle [&_code]:px-1 [&_code]:text-[15px] [&_pre]:mb-4 [&_pre]:overflow-x-auto [&_pre]:rounded-tile [&_pre]:bg-subtle [&_pre]:p-4 [&_table]:mb-4 [&_table]:w-full [&_table]:text-[15px] [&_table]:tabular-nums [&_th]:border [&_th]:border-line [&_th]:bg-subtle [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_td]:border [&_td]:border-line [&_td]:px-3 [&_td]:py-2">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {article.body ?? ''}
                </ReactMarkdown>
            </div>

            {children}
        </article>
    )
}
