/**
 * Вход по одноразовой ссылке.
 *
 * Ответ на запрос ссылки намеренно одинаков для существующего и
 * несуществующего адреса (см. Service.RequestMagicLink на бэкенде) — на
 * клиенте этим различием тоже пользоваться нельзя: `request` не возвращает
 * ничего, что могло бы отличаться между двумя случаями.
 */
import { apiClient } from '@/shared/utils/api-client'

export interface MagicLinkConsents {
    terms_of_service: boolean
    privacy_policy: boolean
    data_processing: boolean
    marketing: boolean
}

export const magicLinkApi = {
    /**
     * Запрашивает ссылку для входа на указанный адрес.
     *
     * Сервер отвечает одним и тем же сообщением независимо от того, есть ли
     * аккаунт на этот адрес — поэтому здесь нечего возвращать вызывающему
     * коду, кроме факта, что запрос принят.
     */
    async request(email: string, consents: MagicLinkConsents): Promise<void> {
        await apiClient.post('/api/v1/auth/magic-link/request', { email, consents })
    },

    /**
     * Обменивает токен из ссылки на сессию.
     *
     * `leadToken` переносит заявку гостя (расчёт КБЖУ до регистрации) на
     * аккаунт, если этот переход его создаёт — так же, как это уже делает
     * обычная регистрация. Используется страницей перехода по ссылке
     * (задача 8), не этой формой.
     */
    async consume(token: string, leadToken: string | null): Promise<{ created: boolean }> {
        const data = await apiClient.post<{ created?: boolean }>(
            '/api/v1/auth/magic-link/consume',
            { token, lead_token: leadToken ?? undefined }
        )
        return { created: Boolean(data?.created) }
    },
}
