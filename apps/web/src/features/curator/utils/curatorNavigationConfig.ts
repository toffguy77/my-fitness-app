import { Users, MessageCircle, UserCircle } from 'lucide-react'
import type { CuratorNavigationItemConfig } from '../types'

export const CURATOR_NAVIGATION_ITEMS: CuratorNavigationItemConfig[] = [
    { id: 'clients', label: 'Клиенты', icon: Users, href: '/curator' },
    { id: 'chats', label: 'Чаты', icon: MessageCircle, href: '/curator/chat' },
    { id: 'profile', label: 'Профиль', icon: UserCircle, href: '/profile' },
]
