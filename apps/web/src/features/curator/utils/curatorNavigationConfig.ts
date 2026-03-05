import { Users, MessageCircle, FileText } from 'lucide-react'
import type { CuratorNavigationItemConfig } from '../types'

export const CURATOR_NAVIGATION_ITEMS: CuratorNavigationItemConfig[] = [
    { id: 'clients', label: 'Клиенты', icon: Users, href: '/curator' },
    { id: 'chats', label: 'Чаты', icon: MessageCircle, href: '/curator/chat' },
    { id: 'content', label: 'Контент', icon: FileText, href: '/curator/content' },
]
