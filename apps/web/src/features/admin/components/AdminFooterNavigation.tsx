'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/shared/utils/cn'
import { ADMIN_NAVIGATION_ITEMS } from '../utils/adminNavigationConfig'
import type { AdminNavigationItemId } from '../types'

import { t } from '@/shared/i18n'
export interface AdminFooterNavigationProps {
    activeItem?: AdminNavigationItemId
    onNavigate?: (itemId: AdminNavigationItemId) => void
}

export function AdminFooterNavigation({
    activeItem = 'dashboard',
    onNavigate
}: AdminFooterNavigationProps) {
    const router = useRouter()
    const [currentActive, setCurrentActive] = useState<AdminNavigationItemId>(activeItem)

    const handleNavigationClick = (itemId: AdminNavigationItemId) => {
        setCurrentActive(itemId)

        if (onNavigate) {
            onNavigate(itemId)
        }

        const navItem = ADMIN_NAVIGATION_ITEMS.find(item => item.id === itemId)
        if (navItem?.href) {
            router.push(navItem.href)
        }
    }

    return (
        <nav
            className="fixed bottom-0 left-0 right-0 z-50 grid h-auto min-h-16 grid-cols-4 items-stretch border-t border-line bg-nav px-2 pt-1.5 backdrop-blur-md"
            style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
            data-testid="admin-footer-navigation"
            aria-label={t('admin.navigation.aria')}
        >
            {ADMIN_NAVIGATION_ITEMS.map((item) => {
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
                        <Icon
                            size={24}
                            aria-hidden="true"
                            strokeWidth={isActive ? 2 : 1.8}
                            className="transition-colors"
                        />
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
