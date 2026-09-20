import { LayoutDashboard, Users, MessageCircle, FileText } from 'lucide-react'
import type { AdminNavigationItemConfig } from '../types'

import { t } from '@/shared/i18n'
export const ADMIN_NAVIGATION_ITEMS: AdminNavigationItemConfig[] = [
    { id: 'dashboard', label: t('admin.navigation.dashboard'), icon: LayoutDashboard, href: '/admin' },
    { id: 'users', label: t('admin.navigation.users'), icon: Users, href: '/admin/users' },
    { id: 'content', label: t('admin.navigation.content'), icon: FileText, href: '/admin/content' },
    { id: 'chats', label: t('admin.navigation.chats'), icon: MessageCircle, href: '/admin/chats' },
]
