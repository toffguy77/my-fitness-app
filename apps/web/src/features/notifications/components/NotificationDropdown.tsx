'use client'

import { useEffect, useRef, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useNotificationsStore } from '../store/notificationsStore'
import { CATEGORY_LABELS } from '@/features/content/types'
import type { Notification } from '../types'

interface NotificationDropdownProps {
    onClose: () => void
}

interface GroupedNotifications {
    category: string
    label: string
    count: number
    notifications: Notification[]
}

export function NotificationDropdown({ onClose }: NotificationDropdownProps) {
    const router = useRouter()
    const dropdownRef = useRef<HTMLDivElement>(null)
    const { notifications, fetchNotifications, markAllAsRead } = useNotificationsStore()
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

    // Fetch content notifications and mark all as read on open
    useEffect(() => {
        fetchNotifications('content')
        markAllAsRead('content')
    }, [fetchNotifications, markAllAsRead])

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                onClose()
            }
        }

        // Delay adding the listener to avoid the opening click triggering it
        const timeoutId = setTimeout(() => {
            document.addEventListener('mousedown', handleClickOutside)
        }, 0)

        return () => {
            clearTimeout(timeoutId)
            document.removeEventListener('mousedown', handleClickOutside)
        }
    }, [onClose])

    // Get last 10 content notifications
    const recentNotifications = useMemo(() => {
        return notifications.content.slice(0, 10)
    }, [notifications.content])

    // Capture mount time to avoid impure Date.now() call during render
    // eslint-disable-next-line react-hooks/purity
    const mountTimeRef = useRef(Date.now())

    // Group unread notifications by contentCategory if 3+ within last hour
    const { groups, ungroupedNotifications } = useMemo(() => {
        const oneHourAgo = new Date(mountTimeRef.current - 60 * 60 * 1000)
        const unreadRecent: Notification[] = []
        const rest: Notification[] = []

        for (const n of recentNotifications) {
            if (!n.readAt && new Date(n.createdAt) > oneHourAgo && n.contentCategory) {
                unreadRecent.push(n)
            } else {
                rest.push(n)
            }
        }

        // Group unread recent by contentCategory
        const categoryMap = new Map<string, Notification[]>()
        for (const n of unreadRecent) {
            const cat = n.contentCategory!
            if (!categoryMap.has(cat)) {
                categoryMap.set(cat, [])
            }
            categoryMap.get(cat)!.push(n)
        }

        const groups: GroupedNotifications[] = []
        const ungroupedFromRecent: Notification[] = []

        for (const [category, items] of categoryMap) {
            if (items.length >= 3) {
                groups.push({
                    category,
                    label: CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS] || category,
                    count: items.length,
                    notifications: items,
                })
            } else {
                ungroupedFromRecent.push(...items)
            }
        }

        return {
            groups,
            ungroupedNotifications: [...ungroupedFromRecent, ...rest],
        }
    }, [recentNotifications])

    const handleNotificationClick = (notification: Notification) => {
        if (notification.actionUrl) {
            router.push(notification.actionUrl)
        }
        onClose()
    }

    const toggleGroup = (category: string) => {
        setExpandedGroups((prev) => {
            const next = new Set(prev)
            if (next.has(category)) {
                next.delete(category)
            } else {
                next.add(category)
            }
            return next
        })
    }

    const handleViewAll = () => {
        router.push('/notifications')
        onClose()
    }

    return (
        <div
            ref={dropdownRef}
            className="fixed right-4 top-16 mt-2 w-80 bg-white rounded-2xl shadow-lg border z-50 overflow-hidden"
        >
            {recentNotifications.length === 0 ? (
                <div className="p-4 text-center text-sm text-gray-500">
                    Нет уведомлений
                </div>
            ) : (
                <div className="max-h-96 overflow-y-auto">
                    {/* Grouped notifications */}
                    {groups.map((group) => (
                        <div key={group.category}>
                            <button
                                type="button"
                                className="w-full p-3 hover:bg-gray-50 border-b text-left"
                                onClick={() => toggleGroup(group.category)}
                            >
                                <span className="text-sm font-medium text-gray-900">
                                    {group.count} новых: {group.label}
                                </span>
                            </button>
                            {expandedGroups.has(group.category) &&
                                group.notifications.map((notification) => (
                                    <button
                                        key={notification.id}
                                        type="button"
                                        className="w-full p-3 pl-6 hover:bg-gray-50 border-b text-left"
                                        onClick={() => handleNotificationClick(notification)}
                                    >
                                        <p className="text-sm font-medium text-gray-900 truncate">
                                            {notification.title}
                                        </p>
                                        <p className="text-xs text-gray-500 truncate">
                                            {notification.content}
                                        </p>
                                    </button>
                                ))}
                        </div>
                    ))}

                    {/* Ungrouped notifications */}
                    {ungroupedNotifications.map((notification) => (
                        <button
                            key={notification.id}
                            type="button"
                            className="w-full p-3 hover:bg-gray-50 border-b text-left"
                            onClick={() => handleNotificationClick(notification)}
                        >
                            <p className="text-sm font-medium text-gray-900 truncate">
                                {notification.title}
                            </p>
                            <p className="text-xs text-gray-500 truncate">
                                {notification.content}
                            </p>
                        </button>
                    ))}
                </div>
            )}

            {/* View all link */}
            <button
                type="button"
                className="w-full p-3 text-sm text-blue-600 hover:bg-gray-50 text-center"
                onClick={handleViewAll}
            >
                Все уведомления
            </button>
        </div>
    )
}
