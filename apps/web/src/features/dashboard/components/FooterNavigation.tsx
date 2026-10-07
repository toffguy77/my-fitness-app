'use client'

import { useState } from 'react'
import { activeNavItem } from '@/shared/utils/activeNavItem'
import { usePathname, useRouter } from 'next/navigation'
import { NavigationItem } from './NavigationItem'
import { NAVIGATION_ITEMS } from '../utils/navigationConfig'
import { useUnreadCount } from '@/features/chat/hooks/useUnreadCount'
import type { NavigationItemId } from '../types'
import { t } from '@/shared/i18n'

export interface FooterNavigationProps {
    activeItem?: NavigationItemId
    onNavigate?: (itemId: NavigationItemId) => void
}

/**
 * FooterNavigation component
 *
 * Bottom navigation menu with five primary app sections.
 * Handles navigation using Next.js router and prevents navigation for disabled items.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 6.3
 */
export function FooterNavigation({
    activeItem,
    onNavigate
}: FooterNavigationProps) {
    const router = useRouter()
    const pathname = usePathname()
    // A tap lights its tab at once; the address takes over as soon as it
    // changes. A tap recorded on another address is stale and ignored.
    const [tapped, setTapped] = useState<{ id: NavigationItemId; on: string | null } | null>(null)
    const currentActive =
        tapped && tapped.on === pathname ? tapped.id : (activeNavItem(pathname, NAVIGATION_ITEMS) ?? activeItem)
    const unreadCount = useUnreadCount()

    const handleNavigationClick = (itemId: NavigationItemId) => {
        // Find the navigation item config
        const navItem = NAVIGATION_ITEMS.find(item => item.id === itemId)

        // Prevent navigation for disabled items (Requirement 2.6)
        if (navItem?.isDisabled) {
            return
        }

        // Update active state
        setTapped({ id: itemId, on: pathname })

        // Call optional callback
        if (onNavigate) {
            onNavigate(itemId)
        }

        // Navigate to the route (Requirement 2.5)
        if (navItem?.href) {
            router.push(navItem.href)
        }
    }

    return (
        <nav
            className="fixed bottom-0 left-0 right-0 z-50 grid h-auto min-h-16 grid-cols-5 items-stretch border-t border-line bg-nav px-2 pt-1.5 backdrop-blur-md"
            style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
            data-testid="footer-navigation"
            aria-label={t('dashboard.navigation.aria')}
        >
            {NAVIGATION_ITEMS.map((item) => (
                <NavigationItem
                    key={item.id}
                    id={item.id}
                    label={item.label}
                    icon={item.icon}
                    href={item.href}
                    isActive={currentActive === item.id}
                    isDisabled={item.isDisabled}
                    badge={item.id === 'chat' ? unreadCount : undefined}
                    onClick={handleNavigationClick}
                />
            ))}
        </nav>
    )
}
