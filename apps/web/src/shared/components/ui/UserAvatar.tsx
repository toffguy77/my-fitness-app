import { forwardRef } from 'react'
import Image from 'next/image'
import { cn } from '@/shared/utils/cn'

export interface UserAvatarProps {
    name: string
    avatarUrl?: string
    size?: 'sm' | 'md' | 'lg'
    onClick?: () => void
    className?: string
}

const sizes = {
    sm: 'h-8 w-8 text-xs',
    md: 'h-10 w-10 text-sm',
    lg: 'h-12 w-12 text-base',
}

// The rendered size in pixels, which `next/image` needs to ask the
// optimiser for the right one. Kept beside the classes above so the two
// cannot drift apart.
const pixelSizes = { sm: 32, md: 40, lg: 48 }

/**
 * Аватар человека.
 *
 * Без фотографии — инициал на нейтральной заливке (`bg-subtle`): аватар стоит в
 * шапке рядом с навигацией, а терракота принадлежит главному действию экрана и
 * активному разделу. Кнопка-аватар занимает не меньше 44 px, даже когда сам
 * круг меньше: в него попадают пальцем.
 */
export const UserAvatar = forwardRef<HTMLButtonElement, UserAvatarProps>(
    ({ name, avatarUrl, size = 'md', onClick, className }, ref) => {
        const getInitials = (name: string): string => {
            return name.charAt(0).toUpperCase()
        }

        const circle = cn(
            'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold',
            'bg-subtle text-fg',
            sizes[size],
        )

        const content = avatarUrl ? (
            <Image
                src={avatarUrl}
                alt={`${name}'s avatar`}
                width={pixelSizes[size]}
                height={pixelSizes[size]}
                className="h-full w-full rounded-full object-cover"
            />
        ) : (
            <span className="select-none" aria-hidden="true">
                {getInitials(name)}
            </span>
        )

        if (onClick) {
            return (
                <button
                    ref={ref}
                    type="button"
                    onClick={onClick}
                    className={cn(
                        'inline-flex min-h-11 min-w-11 items-center justify-center rounded-full transition-opacity hover:opacity-80',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2',
                        className,
                    )}
                    aria-label={`${name}'s profile`}
                    data-testid="user-avatar"
                >
                    <span className={circle}>{content}</span>
                </button>
            )
        }

        return (
            <div
                className={cn(circle, className)}
                aria-label={`${name}'s avatar`}
                data-testid="user-avatar"
            >
                {content}
            </div>
        )
    }
)

UserAvatar.displayName = 'UserAvatar'
