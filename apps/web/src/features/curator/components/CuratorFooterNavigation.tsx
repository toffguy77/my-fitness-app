'use client'

import { useState } from 'react'
import { activeNavItem } from '@/shared/utils/activeNavItem'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/shared/utils/cn'
import { CURATOR_NAVIGATION_ITEMS } from '../utils/curatorNavigationConfig'
import { useUnreadCount } from '@/features/chat/hooks/useUnreadCount'
import type { CuratorNavigationItemId } from '../types'

import { t } from '@/shared/i18n'
export interface CuratorFooterNavigationProps {
    activeItem?: CuratorNavigationItemId
    onNavigate?: (itemId: CuratorNavigationItemId) => void
}

/**
 * CuratorFooterNavigation component
 *
 * Bottom navigation menu for curator-role users.
 * Shows: Clients, Chats, Profile.
 */
export function CuratorFooterNavigation({
    activeItem,
    onNavigate
}: CuratorFooterNavigationProps) {
    const router = useRouter()
    const pathname = usePathname()
    // A tap lights its tab at once; the address takes over as soon as it
    // changes. A tap recorded on another address is stale and ignored.
    const [tapped, setTapped] = useState<{ id: CuratorNavigationItemId; on: string | null } | null>(null)
    const currentActive =
        tapped && tapped.on === pathname ? tapped.id : (activeNavItem(pathname, CURATOR_NAVIGATION_ITEMS) ?? activeItem)
    const unreadCount = useUnreadCount()

    const handleNavigationClick = (itemId: CuratorNavigationItemId) => {
        setTapped({ id: itemId, on: pathname })

        if (onNavigate) {
            onNavigate(itemId)
        }

        const navItem = CURATOR_NAVIGATION_ITEMS.find(item => item.id === itemId)
        if (navItem?.href) {
            router.push(navItem.href)
        }
    }

    return (
        <nav
            className="fixed bottom-0 left-0 right-0 z-50 grid h-auto min-h-16 grid-cols-6 items-stretch border-t border-line bg-nav px-2 pt-1.5 backdrop-blur-md"
            style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
            data-testid="curator-footer-navigation"
            aria-label={t('curator.navigation.aria')}
        >
            {CURATOR_NAVIGATION_ITEMS.map((item) => {
                const Icon = item.icon
                const isActive = currentActive === item.id

                return (
                    <button
                        key={item.id}
                        onClick={() => handleNavigationClick(item.id)}
                        className={cn(
                            'flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-tile px-1 py-1 transition-colors',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-focus',
                            'cursor-pointer hover:text-fg',
                            // Активный пункт — чернилами и точкой бренда под
                            // подписью, как в навигации клиента.
                            isActive ? 'text-fg' : 'text-fg-subtle'
                        )}
                        aria-label={item.label}
                        aria-current={isActive ? 'page' : undefined}
                        data-testid={`nav-item-${item.id}`}
                        data-href={item.href}
                    >
                        <span className="relative">
                            <Icon
                                size={24}
                                aria-hidden="true"
                                strokeWidth={isActive ? 2 : 1.8}
                                className="transition-colors"
                            />
                            {item.id === 'chats' && unreadCount > 0 && (
                                <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold tabular-nums text-on-primary ring-2 ring-canvas">
                                    {unreadCount > 99 ? '99+' : unreadCount}
                                </span>
                            )}
                        </span>
                        <span
                            className={cn(
                                'relative max-w-full truncate pb-1.5 text-[11px] leading-[14px]',
                                'after:absolute after:bottom-0 after:left-1/2 after:h-1 after:w-1 after:-translate-x-1/2 after:rounded-full',
                                isActive ? 'font-semibold after:bg-primary' : 'font-medium after:bg-transparent'
                            )}
                        >
                            {item.label}
                        </span>
                    </button>
                )
            })}
        </nav>
    )
}
