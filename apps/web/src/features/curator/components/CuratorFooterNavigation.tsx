'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/shared/utils/cn'
import { CURATOR_NAVIGATION_ITEMS } from '../utils/curatorNavigationConfig'
import { useUnreadCount } from '@/features/chat/hooks/useUnreadCount'
import type { CuratorNavigationItemId } from '../types'

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
    activeItem = 'clients',
    onNavigate
}: CuratorFooterNavigationProps) {
    const router = useRouter()
    const [currentActive, setCurrentActive] = useState<CuratorNavigationItemId>(activeItem)
    const unreadCount = useUnreadCount()

    const handleNavigationClick = (itemId: CuratorNavigationItemId) => {
        setCurrentActive(itemId)

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
            className="fixed bottom-0 left-0 right-0 z-50 flex h-16 items-center justify-around border-t border-gray-200 bg-white px-2"
            style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
            data-testid="curator-footer-navigation"
            aria-label="Навигация куратора"
        >
            {CURATOR_NAVIGATION_ITEMS.map((item) => {
                const Icon = item.icon
                const isActive = currentActive === item.id

                return (
                    <button
                        key={item.id}
                        onClick={() => handleNavigationClick(item.id)}
                        className={cn(
                            'flex flex-col items-center justify-center gap-1 px-3 py-2 transition-colors',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-600 rounded-lg',
                            'cursor-pointer hover:bg-gray-100',
                            isActive ? 'text-blue-600' : 'text-gray-600'
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
                                className={cn(
                                    'transition-colors',
                                    isActive && 'stroke-[2.5]'
                                )}
                            />
                            {item.id === 'chats' && unreadCount > 0 && (
                                <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-medium text-white">
                                    {unreadCount > 99 ? '99+' : unreadCount}
                                </span>
                            )}
                        </span>
                        <span
                            className={cn(
                                'text-xs transition-all',
                                isActive && 'font-semibold'
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
