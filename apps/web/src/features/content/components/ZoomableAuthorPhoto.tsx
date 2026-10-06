'use client'

import { useState } from 'react'
import Image from 'next/image'

/**
 * The author's photo on his own page: a click enlarges it, another click
 * shrinks it back. In an article's byline the photo stays small and still —
 * there it only marks who signed the text.
 */
export function ZoomableAuthorPhoto({ src, alt }: { src: string; alt: string }) {
    const [zoomed, setZoomed] = useState(false)

    return (
        <button
            type="button"
            onClick={() => setZoomed((z) => !z)}
            aria-pressed={zoomed}
            title={zoomed ? 'Уменьшить фото' : 'Увеличить фото'}
            className={`shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
                zoomed ? 'cursor-zoom-out' : 'cursor-zoom-in'
            }`}
        >
            <Image
                src={src}
                alt={alt}
                width={256}
                height={256}
                priority
                className={`rounded-full object-cover transition-[width,height] duration-200 motion-reduce:transition-none ${
                    zoomed ? 'h-64 w-64' : 'h-12 w-12'
                }`}
            />
        </button>
    )
}
