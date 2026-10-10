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
    badge?: number
    /** Плашка у иконки («бета»). Видна, но в доступное имя не входит: имя пункта — подпись. */
    tag?: string
    onClick?: (id: NavigationItemId) => void
}

export const NavigationItem = forwardRef<HTMLButtonElement, NavigationItemProps>(
    ({ id, label, icon: Icon, href, isActive = false, isDisabled = false, badge, tag, onClick }, ref) => {
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
        const baseStyles = 'flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 px-1 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-focus rounded-tile'

        // Активный пункт — чернилами и точкой бренда под подписью; остальные
        // приглушены. Цветом бренда выделяется одна точка, а не вся вкладка:
        // терракота на экране — для главного действия.
        const activeStyles = isActive
            ? 'text-fg'
            : 'text-fg-subtle'

        const disabledStyles = isDisabled
            ? 'opacity-40 cursor-not-allowed'
            : 'cursor-pointer hover:text-fg'

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
                <span className="relative">
                    <Icon
                        size={iconSize}
                        aria-hidden="true"
                        strokeWidth={isActive ? 2 : 1.8}
                        className="transition-colors"
                    />
                    {badge != null && badge > 0 && (
                        <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-on-primary ring-2 ring-canvas">
                            {badge > 99 ? '99+' : badge}
                        </span>
                    )}
                    {tag && !(badge != null && badge > 0) && (
                        <span
                            aria-hidden="true"
                            data-testid={`nav-tag-${id}`}
                            className="absolute -top-1.5 left-1/2 ml-1.5 rounded-full bg-primary px-1 text-[9px] font-semibold leading-[14px] text-on-primary ring-2 ring-canvas"
                        >
                            {tag}
                        </span>
                    )}
                </span>
                <span
                    className={cn(
                        'relative max-w-full truncate pb-1.5 text-[11px] leading-[14px]',
                        // Точка бренда под подписью активного пункта.
                        'after:absolute after:bottom-0 after:left-1/2 after:h-1 after:w-1 after:-translate-x-1/2 after:rounded-full',
                        isActive ? 'font-semibold after:bg-primary' : 'font-medium after:bg-transparent'
                    )}
                >
                    {label}
                </span>
            </button>
        )
    }
)

NavigationItem.displayName = 'NavigationItem'
