import { apiClient } from '@/shared/utils/api-client'

const BASE = '/api/v1/notifications/delivery-preferences'

/** One event type's row: which channels may carry it. */
export interface TypeSetting {
    type: string
    /** Always true. Reported rather than omitted so the column can explain why it does not move. */
    app: boolean
    email: boolean
    push: boolean
}

export interface DeliveryPreferences {
    types: TypeSetting[]
    quietHoursStart: number | null
    quietHoursEnd: number | null
    timezone: string
    emailUnsubscribed: boolean
}

export interface UpdateDeliveryPreferences {
    types: TypeSetting[]
    quietHoursStart: number | null
    quietHoursEnd: number | null
    emailUnsubscribed?: boolean
}

export async function getDeliveryPreferences(): Promise<DeliveryPreferences> {
    return apiClient.get<DeliveryPreferences>(BASE)
}

export async function updateDeliveryPreferences(req: UpdateDeliveryPreferences): Promise<void> {
    await apiClient.put(BASE, req)
}

/**
 * Turns off every email for the account the token names.
 *
 * Unauthenticated on purpose: the link is at the bottom of an email, and
 * somebody who wants the email to stop should not have to remember a password.
 */
export async function unsubscribeFromEmail(token: string): Promise<void> {
    await apiClient.post('/api/v1/notifications/unsubscribe', { token })
}

/** What each event type is called on the settings screen. */
export const TYPE_LABELS: Record<string, string> = {
    trainer_feedback: 'Ответ куратора',
    feedback_received: 'Отзыв на отчёт',
    plan_updated: 'Изменение плана',
    task_assigned: 'Новая задача',
    task_overdue: 'Просроченная задача',
    export_ready: 'Архив с данными готов',
    client_left: 'Клиент уходит',
    reminder: 'Напоминания',
    achievement: 'Достижения',
    new_content: 'Новые материалы',
    new_feature: 'Новые возможности',
    system_update: 'Системные сообщения',
    general: 'Прочее',
}
