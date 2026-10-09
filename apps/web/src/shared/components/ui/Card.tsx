import { HTMLAttributes, forwardRef } from 'react'
import { cn } from '@/shared/utils/cn'

/**
 * Карточка — основная поверхность экрана: `bg-surface`, граница 1 px, радиус 18.
 *
 * - `default` / `bordered` — обычная карточка (тени нет: поверхности
 *   отделяются тонкой линией, как бумага на бумаге).
 * - `elevated` — то, что лежит над экраном: всплывающие окна, меню.
 * - `coach` — голос куратора: тёмная плашка, текст `text-on-coach`.
 * - `plain` — без рамки и фона, только отступы (секция на фоне экрана).
 */
export interface CardProps extends HTMLAttributes<HTMLDivElement> {
    variant?: 'default' | 'bordered' | 'elevated' | 'coach' | 'plain'
}

const variants = {
    default: 'bg-surface border border-line text-fg',
    bordered: 'bg-surface border border-line text-fg',
    elevated: 'bg-surface text-fg shadow-overlay',
    coach: 'bg-coach text-on-coach',
    plain: 'bg-transparent',
} as const

export const Card = forwardRef<HTMLDivElement, CardProps>(
    ({ className, variant = 'default', ...props }, ref) => (
        <div ref={ref} className={cn('rounded-card p-5', variants[variant], className)} {...props} />
    ),
)

Card.displayName = 'Card'

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
    ({ className, ...props }, ref) => <div ref={ref} className={cn('mb-4', className)} {...props} />,
)

CardHeader.displayName = 'CardHeader'

/** Заголовок карточки — засечками (type-title-3). Смысловой уровень задаёт `as`. */
export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
    ({ className, ...props }, ref) => <h3 ref={ref} className={cn('type-title-3', className)} {...props} />,
)

CardTitle.displayName = 'CardTitle'

export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
    ({ className, ...props }, ref) => <div ref={ref} className={cn('', className)} {...props} />,
)

CardContent.displayName = 'CardContent'
