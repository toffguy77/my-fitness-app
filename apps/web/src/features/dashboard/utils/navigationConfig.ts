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
import { t } from '@/shared/i18n'

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
        label: t('dashboard.navigation.dashboard'),
        icon: LayoutDashboard,
        href: '/dashboard',
    },
    {
        id: 'food-tracker',
        label: t('dashboard.navigation.foodTracker'),
        icon: Utensils,
        href: '/food-tracker',
    },
    {
        id: 'workout',
        label: t('dashboard.navigation.workout'),
        icon: Dumbbell,
        href: '/workout',
        isDisabled: true,
    },
    {
        id: 'chat',
        label: t('dashboard.navigation.chat'),
        icon: MessageCircle,
        href: '/chat',
    },
    {
        id: 'content',
        label: t('dashboard.navigation.content'),
        icon: FileText,
        href: '/content',
    },
]
