'use client'

import Image from 'next/image'
import type { PhotoView } from '../types'

import { t } from '@/shared/i18n'
function formatDateRange(weekStart: string, weekEnd: string): string {
    const start = new Date(weekStart + 'T00:00:00')
    const end = new Date(weekEnd + 'T00:00:00')
    const startStr = start.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
    const endStr = end.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })
    return `${startStr} — ${endStr}`
}

interface PhotosSectionProps {
    photos: PhotoView[]
}

export function PhotosSection({ photos }: PhotosSectionProps) {
    if (!photos || photos.length === 0) return null

    return (
        <section className="rounded-card border border-line bg-surface p-5">
            <h2 className="type-title-3 mb-4 text-fg">{t('curator.photos.heading')}</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                {photos.map((photo) => (
                    <div key={photo.id} className="space-y-1">
                        <div className="relative aspect-[3/4] overflow-hidden rounded-tile bg-subtle">
                            <Image
                                src={photo.photo_url}
                                alt={t('curator.photos.alt', { range: formatDateRange(photo.week_start, photo.week_end) })}
                                fill
                                className="object-cover"
                                unoptimized
                            />
                        </div>
                        <p className="text-center text-[13px] tabular-nums text-fg-muted">
                            {formatDateRange(photo.week_start, photo.week_end)}
                        </p>
                    </div>
                ))}
            </div>
        </section>
    )
}
