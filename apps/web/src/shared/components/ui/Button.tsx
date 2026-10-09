import { ButtonHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/shared/utils/cn'

/**
 * Кнопка дизайн-системы.
 *
 * - `primary` — одно главное действие на экране (терракота).
 * - `secondary` — контур чернилами: второе по важности действие рядом с главным.
 * - `outline` — то же, что `secondary` (имя осталось от прежних экранов).
 * - `ghost` — без подложки: действия в строках и заголовках карточек.
 * - `danger` — необратимое действие, только после подтверждения.
 * - `inverse` — на тёмной поверхности куратора (`bg-coach`).
 *
 * Форма — «таблетка». Высота: sm 36, md 44 (минимальная область нажатия), lg 48.
 * Кнопка из одной иконки — `IconButton`: у неё обязателен `aria-label`.
 */
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'inverse'
    size?: 'sm' | 'md' | 'lg'
    isLoading?: boolean
    /** Растянуть на ширину контейнера. */
    block?: boolean
}

export const buttonVariants = {
    primary: 'bg-primary text-on-primary hover:bg-primary-hover',
    secondary: 'border-[1.5px] border-line-strong bg-transparent text-fg hover:bg-subtle',
    outline: 'border-[1.5px] border-line-strong bg-transparent text-fg hover:bg-subtle',
    ghost: 'bg-transparent text-fg hover:bg-subtle',
    danger: 'bg-danger text-on-primary hover:opacity-90',
    inverse: 'bg-on-coach text-coach hover:opacity-90',
} as const

export const buttonSizes = {
    sm: 'h-9 gap-1.5 px-4 text-sm',
    md: 'h-11 gap-2 px-5 text-[15px]',
    lg: 'h-12 gap-2 px-6 text-base',
} as const

export const buttonBase =
    'inline-flex items-center justify-center rounded-full font-semibold whitespace-nowrap select-none ' +
    'transition-[background-color,opacity,transform] duration-150 ease-standard active:scale-[0.98] ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 ' +
    'disabled:pointer-events-none disabled:opacity-50'

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = 'primary', size = 'md', isLoading, block, children, disabled, ...props }, ref) => {
        return (
            <button
                ref={ref}
                className={cn(buttonBase, buttonVariants[variant], buttonSizes[size], block && 'w-full', className)}
                disabled={disabled || isLoading}
                aria-busy={isLoading}
                aria-disabled={disabled || isLoading}
                {...props}
            >
                {isLoading && (
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" aria-hidden="true">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                )}
                {children}
            </button>
        )
    }
)

Button.displayName = 'Button'

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
    /** Подпись для экранного диктора — у кнопки без текста она единственная. */
    'aria-label': string
    variant?: 'secondary' | 'ghost' | 'primary' | 'subtle' | 'on-coach'
    size?: 'md' | 'lg'
}

const iconVariants = {
    secondary: 'border-[1.5px] border-line-strong text-fg hover:bg-subtle',
    ghost: 'text-fg hover:bg-subtle',
    primary: 'bg-primary text-on-primary hover:bg-primary-hover',
    subtle: 'bg-subtle text-fg hover:bg-line',
    'on-coach': 'border-[1.5px] border-on-coach-muted text-on-coach hover:bg-white/10',
} as const

/** Круглая кнопка-иконка 44 или 48 px. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
    ({ className, variant = 'secondary', size = 'md', type = 'button', ...props }, ref) => (
        <button
            ref={ref}
            type={type}
            className={cn(
                'inline-flex shrink-0 items-center justify-center rounded-full transition-colors duration-150 touch-manipulation',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2',
                'disabled:pointer-events-none disabled:opacity-50',
                size === 'md' ? 'h-11 w-11' : 'h-12 w-12',
                iconVariants[variant],
                className,
            )}
            {...props}
        />
    ),
)

IconButton.displayName = 'IconButton'
