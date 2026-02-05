import { forwardRef } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/shared/utils/cn'
import type { NavigationItemId } from '../types'

export interface NavigationItemProps {
    id: NavigationItemId
    label: string
    icon: LucideIcon
    href: string
    isActive?: boolean
    isDisabled?: boolean
    onClick?: (id: NavigationItemId) => void
}

export const NavigationItem = forwardRef<HTMLButtonElement, NavigationItemProps>(
    ({ id, label, icon: Icon, href, isActive = false, isDisabled = false, onClick }, ref) => {
        const handleClick = () => {
            if (!isDisabled && onClick) {
                onClick(id)
            }
        }

        const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
            // Support Enter and Space for keyboard navigation
            if ((e.key === 'Enter' || e.key === ' ') && !isDisabled && onClick) {
                e.preventDefault()
                onClick(id)
            }
        }

        // Base styles for all states
        const baseStyles = 'flex flex-col items-center justify-center gap-1 px-3 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-600 rounded-lg'

        // Active state: accent color and bold text
        const activeStyles = isActive
            ? 'text-blue-600'
            : 'text-gray-600'

        // Disabled state: reduced opacity and grey color
        const disabledStyles = isDisabled
            ? 'opacity-40 text-gray-400 cursor-not-allowed'
            : 'cursor-pointer hover:bg-gray-100'

        // Icon size
        const iconSize = 24

        return (
            <button
                ref={ref}
                onClick={handleClick}
                onKeyDown={handleKeyDown}
                disabled={isDisabled}
                className={cn(baseStyles, activeStyles, disabledStyles)}
                aria-label={label}
                aria-current={isActive ? 'page' : undefined}
                aria-disabled={isDisabled}
                data-testid={`nav-item-${id}`}
                data-href={href}
            >
                <Icon
                    size={iconSize}
                    aria-hidden="true"
                    className={cn(
                        'transition-colors',
                        isActive && 'stroke-[2.5]'
                    )}
                />
                <span
                    className={cn(
                        'text-xs transition-all',
                        isActive && 'font-semibold'
                    )}
                >
                    {label}
                </span>
            </button>
        )
    }
)

NavigationItem.displayName = 'NavigationItem'
