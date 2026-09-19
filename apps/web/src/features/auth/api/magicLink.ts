/**
 * Вход по одноразовой ссылке.
 *
 * Ответ на запрос ссылки намеренно одинаков для существующего и
 * несуществующего адреса (см. Service.RequestMagicLink на бэкенде) — на
 * клиенте этим различием тоже пользоваться нельзя: `request` не возвращает
 * ничего, что могло бы отличаться между двумя случаями.
 */
import { apiClient } from '@/shared/utils/api-client'
import type { AuthResponse, ConsentState } from '@/features/auth/types'

// Согласия при входе по ссылке — те же четыре поля, что ConsentState обычной
// регистрации, псевдоним, а не отдельное определение: появится поле в
// ConsentState — появится и здесь, без отдельной правки, которую легко
// забыть. Развели бы два определения — типы разошлись бы молча, и tsc не
// заметил бы, что новое согласие перестало уходить на сервер.
export type MagicLinkConsents = ConsentState

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
     * Бэкенд (`ConsumeMagicLink`) отвечает `{user, created}` — без токена в
     * теле: доступ выдаётся HttpOnly-cookie, как и у остального входа (см.
     * `h.setRefreshCookie` в `handler.go`). `user` нужен странице перехода по
     * ссылке (задача 8), чтобы показать, в чей аккаунт она вошла, не делая
     * для этого второй запрос.
     *
     * `leadToken` переносит заявку гостя (расчёт КБЖУ до регистрации) на
     * аккаунт, если этот переход его создаёт — так же, как это уже делает
     * обычная регистрация.
     */
    async consume(
        token: string,
        leadToken: string | null
    ): Promise<{ user: AuthResponse['user']; created: boolean }> {
        const data = await apiClient.post<{ user: AuthResponse['user']; created?: boolean }>(
            '/api/v1/auth/magic-link/consume',
            { token, lead_token: leadToken ?? undefined }
        )
        return { user: data.user, created: Boolean(data.created) }
    },
}
