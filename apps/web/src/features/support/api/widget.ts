/**
 * Разговор с ботом до регистрации.
 *
 * Токен хранится явно и передаётся явно — в отличие от токена заявки, у
 * которого есть вторая копия в cookie (см. guest.ts, rememberLeadToken).
 * Та копия нужна ему потому, что при входе через внешнего провайдера браузер
 * уходит на чужой домен и возвращается на серверный колбэк, которому
 * localStorage недоступен. У виджета такого перехода нет: весь разговор идёт
 * на одной странице, поэтому одного localStorage достаточно — он переживает
 * перезагрузку вкладки, но не путешествует к чужому компьютеру и не лежит
 * там, где его прочтёт кто-то ещё. Cookie здесь была бы лишней поверхностью:
 * она прикладывалась бы и к запросам с настоящей сессией, где сервер обязан
 * был бы её игнорировать.
 */

import { apiClient } from '@/shared/utils/api-client'
import { isApiError, messageFor } from '@/shared/errors/apiErrors'
import { rememberLeadToken, type LeadConsents } from '@/features/onboarding/api/guest'

/** Где браузер держит предъявительский токен веб-разговора. */
export const WIDGET_TOKEN_KEY = 'support_web_token'

export interface WidgetMessage {
    id: string
    author: string
    text: string
    created_at: string
    delivered?: boolean
}

export interface WidgetMessagesResult {
    messages: WidgetMessage[]
    status: string
}

export interface WidgetStartResult {
    token: string
    conversationId: string
}

/** Сохраняет токен так, чтобы разговор пережил перезагрузку страницы. */
function rememberWidgetToken(token: string): void {
    try {
        localStorage.setItem(WIDGET_TOKEN_KEY, token)
    } catch {
        // Приватное окно или запрет хранилища: разговор будет разовым, но
        // виджет обязан открыться, а не упасть.
    }
}

/**
 * Токен текущего разговора, если он есть.
 *
 * Ошибка чтения (приватный просмотр, запрет хранилища) не должна помешать
 * виджету открыться — она читается как "разговора ещё нет", а не как сбой.
 */
export function widgetToken(): string | null {
    try {
        return localStorage.getItem(WIDGET_TOKEN_KEY)
    } catch {
        return null
    }
}

export const widgetApi = {
    /** Заводит разговор и запоминает выданный токен. */
    async start(): Promise<WidgetStartResult> {
        const data = await apiClient.post<{ token: string; conversation_id: string }>(
            '/api/v1/public/support/web',
            {}
        )
        rememberWidgetToken(data.token)
        return { token: data.token, conversationId: data.conversation_id }
    },

    /** Отправляет вопрос. Ответ бота (или отказ) читается через messages(). */
    async send(token: string, text: string): Promise<void> {
        await apiClient.post('/api/v1/public/support/web/message', { token, text })
    },

    /** Переписка целиком и статус разговора. */
    messages(token: string): Promise<WidgetMessagesResult> {
        return apiClient.get<WidgetMessagesResult>(
            `/api/v1/public/support/web/messages?token=${encodeURIComponent(token)}`
        )
    },

    /** «Позвать человека» — без вопроса модели, сразу в операторскую очередь. */
    async human(token: string): Promise<void> {
        await apiClient.post('/api/v1/public/support/web/human', { token })
    },

    /**
     * Оставляет контакт. Возвращённый токен заявки запоминается той же
     * функцией, что и токен заявки из мастера онбординга — это одна и та же
     * заявка, и её продолжение (например, вход после регистрации) должно
     * находить её тем же способом.
     */
    async contact(
        token: string,
        email: string,
        consents: LeadConsents
    ): Promise<{ token: string }> {
        const data = await apiClient.post<{ token: string }>(
            '/api/v1/public/support/web/contact',
            { token, email, consents }
        )
        rememberLeadToken(data.token)
        return data
    },
}

/**
 * Причина отказа, для показа посетителю.
 *
 * Общий `messageFor` (shared/errors/apiErrors) предпочитает перевод по коду
 * серверной фразе — правильно почти везде, но не здесь. Веб-разговор
 * переиспользует общие коды (`rate_limited`, `not_found`, `conflict` —
 * handler.go, по образцу account/export.go) для отказов, у каждого из
 * которых уже есть точная причина в `message`: «в этом чате слишком много
 * сообщений — позовите человека», а не общее «подождите немного», которое
 * здесь и неверно — ждать нечего, потолок разговора не сдвигается со
 * временем, и «подождите» отправило бы человека мимо единственного, что
 * сработает.
 *
 * Поэтому здесь порядок обратный: серверная фраза предпочитается словарю по
 * коду, а не наоборот. Общий словарь остаётся резервом — для сетевого сбоя и
 * для всего, чего сервер не объяснил.
 */
export function widgetErrorMessage(error: unknown): string {
    if (isApiError(error)) {
        const body = error.data as { message?: string } | undefined
        if (body?.message) return body.message
    }
    return messageFor(error)
}
