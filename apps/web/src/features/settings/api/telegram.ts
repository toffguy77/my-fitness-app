import { apiClient } from '@/shared/utils/api-client'

export interface TelegramLinkState {
    linked: boolean
    username?: string
    linked_at?: string
}

export interface TelegramConnectLink {
    url: string
    expires_in: number
}

const BASE = '/api/v1/users/me/telegram'

export const telegramApi = {
    status: () => apiClient.get<TelegramLinkState>(BASE),
    /**
     * Каждый вызов выдаёт новый одноразовый билет, поэтому POST, а не GET.
     * Ссылка живёт минуты: она даёт право получать уведомления этого аккаунта.
     */
    connect: () => apiClient.post<TelegramConnectLink>(BASE, {}),
    disconnect: () => apiClient.delete<TelegramLinkState>(BASE),
}
