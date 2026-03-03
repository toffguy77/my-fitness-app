'use client'

import Image from 'next/image'
import type { PhotoView } from '../types'

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
        <section className="rounded-xl bg-white p-4 shadow-sm border border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Фото клиента</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {photos.map((photo) => (
                    <div key={photo.id} className="space-y-1">
                        <div className="relative aspect-[3/4] rounded-lg overflow-hidden bg-gray-100">
                            <Image
                                src={photo.photo_url}
                                alt={`Фото за ${formatDateRange(photo.week_start, photo.week_end)}`}
                                fill
                                className="object-cover"
                                unoptimized
                            />
                        </div>
                        <p className="text-xs text-gray-500 text-center">
                            {formatDateRange(photo.week_start, photo.week_end)}
                        </p>
                    </div>
                ))}
            </div>
        </section>
    )
}
