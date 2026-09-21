import { expect, type APIRequestContext } from '@playwright/test'

/**
 * Чтение писем из ловца почты.
 *
 * Жило внутри `registration.spec.ts`. Вынесено, когда понадобилось второму
 * файлу: одноразовая учётная запись заводится тем же путём, каким её заводит
 * человек, — с настоящим письмом и настоящим кодом, — и переписывать разбор
 * письма во второй раз значило бы завести вторую его версию, которая разойдётся
 * с первой при первой же правке шаблона.
 */
export const MAILPIT = process.env.MAILPIT_URL || 'http://localhost:8025'

export interface MailpitMessage {
    ID: string
    Subject: string
}

/** Письмо для адреса, самое свежее. Ждём: почта уходит не мгновенно. */
export async function waitForLetter(
    request: APIRequestContext,
    address: string,
): Promise<MailpitMessage> {
    for (let attempt = 0; attempt < 30; attempt++) {
        const response = await request.get(
            `${MAILPIT}/api/v1/search?query=${encodeURIComponent('to:' + address)}`,
        )
        if (response.ok()) {
            const body = await response.json()
            const messages = (body.messages ?? []) as MailpitMessage[]
            if (messages.length > 0) return messages[0]
        }
        await new Promise((resolve) => setTimeout(resolve, 500))
    }
    throw new Error(`письмо на ${address} не пришло за 15 секунд`)
}

/**
 * Шестизначный код из письма.
 *
 * Берём из текста письма, а не из базы: смысл проверки в том, что человек
 * получает код, которым можно воспользоваться. Код, верный в базе и
 * испорченный шаблоном, — это ровно тот отказ, который здесь и ловится.
 */
export async function codeFromLetter(
    request: APIRequestContext,
    messageID: string,
): Promise<string> {
    const response = await request.get(`${MAILPIT}/api/v1/message/${messageID}`)
    expect(response.ok(), 'письмо не читается').toBeTruthy()
    const body = await response.json()
    const text = `${body.Text ?? ''}\n${body.HTML ?? ''}`

    const code = text.match(/\b(\d{6})\b/)
    expect(code, `в письме нет шестизначного кода:\n${text.slice(0, 400)}`).toBeTruthy()
    return code![1]
}

/** Свой адрес на каждый прогон: иначе второй прогон упрётся в первый.
 *
 * Домен `burcev.test` не маршрутизируется и подпадает под шаблоны зачистки —
 * заведённая учётка удаляется после прогона (см.
 * scripts/check-e2e-guest-emails.mjs). */
export function freshAddress(prefix = 'stand'): string {
    return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}@burcev.test`
}
