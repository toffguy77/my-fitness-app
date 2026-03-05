import type { LucideIcon } from 'lucide-react'

export type AdminNavigationItemId = 'dashboard' | 'users' | 'content' | 'chats'

export interface AdminNavigationItemConfig {
    id: AdminNavigationItemId
    label: string
    icon: LucideIcon
    href: string
}

export interface AdminUser {
    id: number
    email: string
    name: string
    role: string
    avatar_url?: string
    curator_name?: string
    curator_id?: number
    client_count: number
    created_at: string
    last_login_at?: string
}

export interface CuratorLoad {
    id: number
    name: string
    email: string
    avatar_url?: string
    client_count: number
}

export interface AdminConversation {
    id: string
    client_id: number
    client_name: string
    curator_id: number
    curator_name: string
    message_count: number
    updated_at: string
}

export interface AdminMessage {
    id: string
    sender_id: number
    sender_name: string
    type: string
    content?: string
    created_at: string
}
