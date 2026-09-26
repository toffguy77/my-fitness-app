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

export interface CuratorGroupInvite {
    invite_link: string
}

const BASE = '/api/v1/users/me/telegram'

export const telegramApi = {
    status: () => apiClient.get<TelegramLinkState>(BASE),
    /**
     * Ссылка в рабочую группу кураторов.
     *
     * Нужна тем, кто не привязал Telegram: бот не пишет первым, и увидеть
     * ссылку больше негде. Отвечает `503`, если группа не настроена в окружении
     * или приглашение спрашивающему не положено — в обоих случаях показывать
     * нечего, и отличать их клиенту не нужно.
     */
    groupInvite: () => apiClient.get<CuratorGroupInvite>('/api/v1/users/me/curator-group'),
    /**
     * Каждый вызов выдаёт новый одноразовый билет, поэтому POST, а не GET.
     * Ссылка живёт минуты: она даёт право получать уведомления этого аккаунта.
     */
    connect: () => apiClient.post<TelegramConnectLink>(BASE, {}),
    disconnect: () => apiClient.delete<TelegramLinkState>(BASE),
}
