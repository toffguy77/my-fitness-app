'use client'

import Image from 'next/image'
import { ChefHat } from 'lucide-react'
import { cn } from '@/shared/utils/cn'

// Фото рецептов лежат в нашем хранилище. Адрес с чужого хоста не рисуется:
// оптимизатор Next выключен (`unoptimized`), и белый список хоста — то, что
// не даёт карточке стать окном для произвольной картинки.
const ALLOWED_IMAGE_HOSTS = ['storage.yandexcloud.net']

export function isTrustedImageUrl(url: string | null | undefined): url is string {
    if (!url) return false
    try {
        return ALLOWED_IMAGE_HOSTS.includes(new URL(url).hostname)
    } catch {
        return false
    }
}

interface RecipePhotoProps {
    url: string | null | undefined
    alt: string
    className?: string
    /** Приоритет загрузки для фото над сгибом экрана. */
    priority?: boolean
}

/** Фото блюда в заданной пропорции или нейтральная заглушка со значком. */
export function RecipePhoto({ url, alt, className, priority }: RecipePhotoProps) {
    return (
        <div className={cn('relative w-full overflow-hidden bg-subtle', className)}>
            {isTrustedImageUrl(url) ? (
                <Image src={url} alt={alt} fill className="object-cover" unoptimized priority={priority} />
            ) : (
                <div className="flex h-full w-full items-center justify-center text-fg-subtle" data-testid="recipe-photo-placeholder">
                    <ChefHat className="h-8 w-8" strokeWidth={1.5} aria-hidden="true" />
                </div>
            )}
        </div>
    )
}
