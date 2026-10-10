'use client'

import Link from 'next/link'
import Image from 'next/image'
import type { ArticleCard } from '@/features/content/types'
import { CATEGORY_LABELS } from '@/features/content/types'
import { articlePath } from '@/features/content/utils/articlePath'
import { isTrustedImageUrl } from '@/features/content/utils/coverImage'

export interface FeedCardProps {
    article: ArticleCard
}

function formatDate(dateStr?: string): string {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    return date.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    })
}

export function FeedCard({ article }: FeedCardProps) {
    return (
        <Link
            href={articlePath(article)}
            className="block overflow-hidden rounded-card border border-line bg-surface transition-colors hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
        >
            {article.cover_image_url && isTrustedImageUrl(article.cover_image_url) && (
                <div className="relative w-full aspect-[16/9]">
                    <Image
                        src={article.cover_image_url}
                        alt={article.title}
                        fill
                        className="object-cover"
                        unoptimized
                        onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none'
                        }}
                    />
                </div>
            )}

            <div className="space-y-2 p-4">
                {/* Категория опознаёт тему и не оценивает её — нейтральной меткой. */}
                <span className="inline-block rounded-full bg-subtle px-2.5 py-0.5 text-xs font-medium text-fg-muted">
                    {CATEGORY_LABELS[article.category]}
                </span>

                <h3 className="line-clamp-2 type-title-3 text-fg">
                    {article.title}
                </h3>

                <p className="line-clamp-3 text-sm text-fg-muted">
                    {article.excerpt}
                </p>

                {article.published_at && (
                    <p className="text-xs text-fg-subtle tabular-nums">
                        {formatDate(article.published_at)}
                    </p>
                )}
            </div>
        </Link>
    )
}
