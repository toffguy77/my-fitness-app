/**
 * Право на работу с куратором — платная часть продукта.
 *
 * Живёт в shared, а не в features/chat: состояние права спрашивают два экрана —
 * переписка и дашборд, — и класть его в одну из фич значило бы, что вторая
 * тянет зависимость через границу.
 */

import { apiClient } from '@/shared/utils/api-client'

/** Состояние права клиента. */
export interface CuratorAccess {
    allowed: boolean
    /**
     * Куратор был, а право кончилось. Отличается от отсутствия куратора с
     * самого начала: первому нужно предложение купить, второму — продлить.
     */
    expired: boolean
    /** Последний день действия права, ГГГГ-ММ-ДД по московскому времени. */
    expires_at?: string
    /** Прежняя переписка: читать её можно и без права. */
    conversation_id?: string
}

export const curatorAccessApi = {
    getAccess: () => apiClient.get<CuratorAccess>('/api/v1/conversations/access'),

    /**
     * Заявка на куратора. Адрес не передаётся: человек вошёл, и сервер берёт
     * его из учётной записи — вернее, чем то, что он наберёт заново.
     */
    requestCurator: (captureSource: string) =>
        apiClient.post<{ id: number }>('/api/v1/leads/curator-request', {
            capture_source: captureSource,
        }),
}
