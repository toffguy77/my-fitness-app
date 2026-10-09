import { cn } from '@/shared/utils/cn'

export interface SpinnerProps {
    /** Что загружается — для экранного диктора. Видимой подписи нет. */
    label: string
    /** Размер кольца: 24 — внутри блока, 32 — на всю страницу. */
    size?: 'md' | 'lg'
    className?: string
}

/**
 * Ожидание внутри экрана: кольцо из дорожки и дуги бренда.
 *
 * Один спиннер на всё приложение. До него разделы рисовали ожидание кто во
 * что горазд — иконкой Loader2, кругом с синей дугой, тремя точками.
 */
export function Spinner({ label, size = 'md', className }: SpinnerProps) {
    return (
        <div role="status" aria-label={label} className={cn('flex items-center justify-center py-12', className)}>
            <span
                aria-hidden="true"
                data-testid="spinner"
                className={cn(
                    'animate-spin rounded-full border-2 border-line border-t-primary',
                    size === 'lg' ? 'h-8 w-8' : 'h-6 w-6',
                )}
            />
        </div>
    )
}
