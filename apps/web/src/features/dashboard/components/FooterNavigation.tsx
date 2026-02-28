'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { NavigationItem } from './NavigationItem'
import { NAVIGATION_ITEMS } from '../utils/navigationConfig'
import { useUnreadCount } from '@/features/chat/hooks/useUnreadCount'
import type { NavigationItemId } from '../types'

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
    activeItem = 'dashboard',
    onNavigate
}: FooterNavigationProps) {
    const router = useRouter()
    const [currentActive, setCurrentActive] = useState<NavigationItemId>(activeItem)
    const unreadCount = useUnreadCount()

    const handleNavigationClick = (itemId: NavigationItemId) => {
        // Find the navigation item config
        const navItem = NAVIGATION_ITEMS.find(item => item.id === itemId)

        // Prevent navigation for disabled items (Requirement 2.6)
        if (navItem?.isDisabled) {
            return
        }

        // Update active state
        setCurrentActive(itemId)

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
            className="fixed bottom-0 left-0 right-0 z-50 flex h-16 items-center justify-around border-t border-gray-200 bg-white px-2"
            style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
            data-testid="footer-navigation"
            aria-label="Основная навигация"
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
