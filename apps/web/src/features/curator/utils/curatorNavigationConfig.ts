import { Users, MessageCircle, FileText, UserPlus, LifeBuoy } from 'lucide-react'
import type { CuratorNavigationItemConfig } from '../types'

import { t } from '@/shared/i18n'
export const CURATOR_NAVIGATION_ITEMS: CuratorNavigationItemConfig[] = [
    { id: 'hub', label: t('curator.navigation.clients'), icon: Users, href: '/curator' },
    { id: 'chats', label: t('curator.navigation.chats'), icon: MessageCircle, href: '/curator/chat' },
    { id: 'content', label: t('curator.navigation.content'), icon: FileText, href: '/curator/content' },
    { id: 'leads', label: t('curator.navigation.leads'), icon: UserPlus, href: '/curator/leads' },
    { id: 'support', label: t('curator.navigation.support'), icon: LifeBuoy, href: '/curator/support' },
]
