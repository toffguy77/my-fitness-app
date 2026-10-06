'use client'

import Link from 'next/link'
import Image from 'next/image'
import type { ArticleCard, ContentCategory } from '@/features/content/types'
import { CATEGORY_LABELS } from '@/features/content/types'
import { articlePath } from '@/features/content/utils/articlePath'

export interface FeedCardProps {
    article: ArticleCard
}

const CATEGORY_COLORS: Record<ContentCategory, string> = {
    nutrition: 'bg-primary-soft text-primary',
    training: 'bg-info-soft text-info-fg',
    recipes: 'bg-warning-soft text-warning-fg',
    health: 'bg-success-soft text-success-fg',
    motivation: 'bg-danger-soft text-danger-fg',
    general: 'bg-subtle text-fg',
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

const ALLOWED_IMAGE_HOSTS = ['storage.yandexcloud.net']

function isTrustedImageUrl(url: string): boolean {
    try {
        return ALLOWED_IMAGE_HOSTS.includes(new URL(url).hostname)
    } catch {
        return false
    }
}

export function FeedCard({ article }: FeedCardProps) {
    return (
        <Link
            href={articlePath(article)}
            className="block rounded-xl bg-surface shadow-sm border border-line overflow-hidden transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
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

            <div className="p-4 space-y-2">
                <span
                    className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${CATEGORY_COLORS[article.category]}`}
                >
                    {CATEGORY_LABELS[article.category]}
                </span>

                <h3 className="text-sm font-bold text-fg line-clamp-2">
                    {article.title}
                </h3>

                <p className="text-xs text-fg-muted line-clamp-3">
                    {article.excerpt}
                </p>

                {article.published_at && (
                    <p className="text-xs text-fg-subtle">
                        {formatDate(article.published_at)}
                    </p>
                )}
            </div>
        </Link>
    )
}
