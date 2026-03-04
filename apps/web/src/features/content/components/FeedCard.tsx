'use client'

import Link from 'next/link'
import Image from 'next/image'
import type { ArticleCard, ContentCategory } from '@/features/content/types'
import { CATEGORY_LABELS } from '@/features/content/types'

export interface FeedCardProps {
    article: ArticleCard
}

const CATEGORY_COLORS: Record<ContentCategory, string> = {
    nutrition: 'bg-blue-100 text-blue-700',
    training: 'bg-purple-100 text-purple-700',
    recipes: 'bg-orange-100 text-orange-700',
    health: 'bg-green-100 text-green-700',
    motivation: 'bg-pink-100 text-pink-700',
    general: 'bg-gray-100 text-gray-700',
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
            href={`/content/${article.id}`}
            className="block rounded-xl bg-white shadow-sm border border-gray-100 overflow-hidden transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
        >
            {article.cover_image_url && (
                <div className="relative w-full aspect-[16/9]">
                    <Image
                        src={article.cover_image_url}
                        alt={article.title}
                        fill
                        className="object-cover"
                        unoptimized
                    />
                </div>
            )}

            <div className="p-4 space-y-2">
                <span
                    className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${CATEGORY_COLORS[article.category]}`}
                >
                    {CATEGORY_LABELS[article.category]}
                </span>

                <h3 className="text-sm font-bold text-gray-900 line-clamp-2">
                    {article.title}
                </h3>

                <p className="text-xs text-gray-500 line-clamp-3">
                    {article.excerpt}
                </p>

                {article.published_at && (
                    <p className="text-xs text-gray-400">
                        {formatDate(article.published_at)}
                    </p>
                )}
            </div>
        </Link>
    )
}
