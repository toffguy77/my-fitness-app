import { Users, MessageCircle, FileText } from 'lucide-react'
import type { CuratorNavigationItemConfig } from '../types'

import { t } from '@/shared/i18n'
export const CURATOR_NAVIGATION_ITEMS: CuratorNavigationItemConfig[] = [
    { id: 'hub', label: t('curator.navigation.clients'), icon: Users, href: '/curator' },
    { id: 'chats', label: t('curator.navigation.chats'), icon: MessageCircle, href: '/curator/chat' },
    { id: 'content', label: t('curator.navigation.content'), icon: FileText, href: '/curator/content' },
]
