import { forwardRef } from 'react'
import { cn } from '@/shared/utils/cn'

export interface UserAvatarProps {
    name: string
    avatarUrl?: string
    size?: 'sm' | 'md' | 'lg'
    onClick?: () => void
    className?: string
}

export const UserAvatar = forwardRef<HTMLButtonElement, UserAvatarProps>(
    ({ name, avatarUrl, size = 'md', onClick, className }, ref) => {
        const sizes = {
            sm: 'h-8 w-8 text-xs',
            md: 'h-10 w-10 text-sm',
            lg: 'h-12 w-12 text-base',
        }

        const getInitials = (name: string): string => {
            return name.charAt(0).toUpperCase()
        }

        const baseStyles = 'inline-flex items-center justify-center rounded-full font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-600'
        const interactiveStyles = onClick ? 'cursor-pointer hover:opacity-80' : ''
        const avatarStyles = 'bg-blue-100 text-blue-700 border border-blue-200'

        const content = avatarUrl ? (
            <img
                src={avatarUrl}
                alt={`${name}'s avatar`}
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
                    onClick={onClick}
                    className={cn(baseStyles, sizes[size], interactiveStyles, avatarStyles, className)}
                    aria-label={`${name}'s profile`}
                    data-testid="user-avatar"
                >
                    {content}
                </button>
            )
        }

        return (
            <div
                className={cn(baseStyles, sizes[size], avatarStyles, className)}
                aria-label={`${name}'s avatar`}
                data-testid="user-avatar"
            >
                {content}
            </div>
        )
    }
)

UserAvatar.displayName = 'UserAvatar'
