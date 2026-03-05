import { LayoutDashboard, Users, MessageCircle, FileText } from 'lucide-react'
import type { AdminNavigationItemConfig } from '../types'

export const ADMIN_NAVIGATION_ITEMS: AdminNavigationItemConfig[] = [
    { id: 'dashboard', label: 'Обзор', icon: LayoutDashboard, href: '/admin' },
    { id: 'users', label: 'Пользователи', icon: Users, href: '/admin/users' },
    { id: 'content', label: 'Контент', icon: FileText, href: '/admin/content' },
    { id: 'chats', label: 'Чаты', icon: MessageCircle, href: '/admin/chats' },
]
