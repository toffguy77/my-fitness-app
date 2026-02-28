import type { LucideIcon } from 'lucide-react'

export type CuratorNavigationItemId = 'clients' | 'chats' | 'profile'

export interface CuratorNavigationItemConfig {
    id: CuratorNavigationItemId
    label: string
    icon: LucideIcon
    href: string
}
