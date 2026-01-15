/**
 * Типы для системы инвайт-кодов
 */

export interface InviteCode {
    id: string
    code: string
    link: string
    max_uses: number | null
    used_count: number
    expires_at: string | null
    is_active: boolean
    created_at: string
    last_used_at: string | null
    statistics?: {
        total_registrations: number
        recent_registrations: number
    }
}

export interface InviteCodeValidation {
    valid: boolean
    curator_name?: string
    expires_at?: string
    remaining_uses?: number
}
