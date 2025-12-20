/**
 * Типы для чата
 */

export interface Message {
    id: string
    sender_id: string
    receiver_id: string
    content: string
    created_at: string
    read_at: string | null
    is_deleted: boolean
}

export interface ChatParticipant {
    id: string
    name: string
    email?: string
    avatar_url?: string
}

