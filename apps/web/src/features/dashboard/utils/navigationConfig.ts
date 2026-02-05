/**
 * Navigation configuration for the dashboard footer navigation
 *
 * This file defines the five primary navigation items with their
 * Russian labels, Lucide icons, routes, and disabled states.
 *
 * Requirements: 2.1, 2.2, 2.4
 */

import {
    LayoutDashboard,
    Utensils,
    Dumbbell,
    MessageCircle,
    FileText,
} from 'lucide-react'
import type { NavigationItemConfig } from '../types'

/**
 * Primary navigation items for the dashboard footer
 *
 * - Dashboard: Main dashboard view (active by default)
 * - Food Tracker: Nutrition logging and tracking
 * - Workout: Exercise tracking (disabled - future feature)
 * - Chat: Communication with trainers
 * - Content: Educational content and resources
 */
export const NAVIGATION_ITEMS: NavigationItemConfig[] = [
    {
        id: 'dashboard',
        label: 'Дашборд',
        icon: LayoutDashboard,
        href: '/dashboard',
    },
    {
        id: 'food-tracker',
        label: 'Фудтрекер',
        icon: Utensils,
        href: '/food-tracker',
    },
    {
        id: 'workout',
        label: 'Тренировка',
        icon: Dumbbell,
        href: '/workout',
        isDisabled: true,
    },
    {
        id: 'chat',
        label: 'Чат',
        icon: MessageCircle,
        href: '/chat',
    },
    {
        id: 'content',
        label: 'Контент',
        icon: FileText,
        href: '/content',
    },
]
