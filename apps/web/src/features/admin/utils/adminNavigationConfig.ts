import { LayoutDashboard, Users, MessageCircle, UserCircle } from 'lucide-react'
import type { AdminNavigationItemConfig } from '../types'

export const ADMIN_NAVIGATION_ITEMS: AdminNavigationItemConfig[] = [
    { id: 'dashboard', label: 'Обзор', icon: LayoutDashboard, href: '/admin' },
    { id: 'users', label: 'Пользователи', icon: Users, href: '/admin/users' },
    { id: 'chats', label: 'Чаты', icon: MessageCircle, href: '/admin/chats' },
    { id: 'profile', label: 'Профиль', icon: UserCircle, href: '/profile' },
]
