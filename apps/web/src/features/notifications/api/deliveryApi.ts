import { apiClient } from '@/shared/utils/api-client'
import { t } from '@/shared/i18n'

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
    trainer_feedback: t('notifications.types.trainer_feedback'),
    feedback_received: t('notifications.types.feedback_received'),
    plan_updated: t('notifications.types.plan_updated'),
    task_assigned: t('notifications.types.task_assigned'),
    task_overdue: t('notifications.types.task_overdue'),
    export_ready: t('notifications.types.export_ready'),
    client_left: t('notifications.types.client_left'),
    reminder: t('notifications.types.reminder'),
    achievement: t('notifications.types.achievement'),
    new_content: t('notifications.types.new_content'),
    new_feature: t('notifications.types.new_feature'),
    system_update: t('notifications.types.system_update'),
    general: t('notifications.types.general'),
    support_escalated: t('notifications.types.support_escalated'),
}

/** The public half of the VAPID pair; a browser cannot subscribe without it. */
export async function getPushKey(): Promise<string> {
    const { publicKey } = await apiClient.get<{ publicKey: string }>(
        '/api/v1/notifications/push-key'
    )
    return publicKey
}

export interface PushSubscriptionPayload {
    endpoint: string
    p256dh: string
    auth: string
}

export async function subscribeToPush(sub: PushSubscriptionPayload): Promise<void> {
    await apiClient.post('/api/v1/notifications/push', sub)
}

export async function unsubscribeFromPush(endpoint: string): Promise<void> {
    await apiClient.delete('/api/v1/notifications/push', {
        body: JSON.stringify({ endpoint }),
        headers: { 'Content-Type': 'application/json' },
    })
}
