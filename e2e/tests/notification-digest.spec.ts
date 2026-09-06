import { test, expect, signIn } from '../fixtures/session'
import { getAccount } from '../fixtures/test-accounts'

/**
 * The digest, end to end: an event happens, an email arrives, the link in it
 * turns the email off.
 *
 * This is the check that otherwise nobody performs. Every other test can pass
 * while the mail never leaves, or leaves with a broken template, or carries an
 * unsubscribe link that does not work — all three look identical from inside
 * the application. Mail goes to a catcher in CI, and this reads it back.
 */

const MAILPIT = process.env.MAILPIT_URL || 'http://localhost:8025'

// This file drives everything through the API and one page; a session handed
// to it by the fixture would belong to the wrong person half the time.
test.use({ role: undefined })

interface Message {
    ID: string
    Subject: string
    To: { Address: string }[]
}

/** Everything the catcher has for one address, newest first. */
async function inboxOf(request: import('@playwright/test').APIRequestContext, address: string) {
    const response = await request.get(`${MAILPIT}/api/v1/search?query=${encodeURIComponent('to:' + address)}`)
    if (!response.ok()) return [] as Message[]
    const body = await response.json()
    return (body.messages ?? []) as Message[]
}

test.describe('Notification digest', () => {
    test.beforeAll(async ({ request }) => {
        // Start from an empty inbox so "the newest message" means this test's.
        await request.delete(`${MAILPIT}/api/v1/messages`).catch(() => {})
    })

    test('an unread notification becomes an email whose link turns email off', async ({
        browser,
        request,
        baseURL,
    }) => {
        test.slow() // the digest waits, then a job picks it up

        const client = getAccount('client')

        // A curator assigning a task is an event whose default channels include
        // email — chosen because somebody is waiting on the answer.
        const curatorContext = await browser.newContext()
        await signIn(curatorContext, baseURL!, 'curator')

        const clients = await curatorContext.request.get(`${baseURL}/api/v1/curator/clients`)
        expect(clients.ok(), await clients.text()).toBeTruthy()
        const roster = (await clients.json()).data ?? []
        const target = roster.find((c: { email?: string }) => c.email === client.email) ?? roster[0]
        expect(target, 'the curator has no clients to assign anything to').toBeTruthy()

        const created = await curatorContext.request.post(
            `${baseURL}/api/v1/curator/clients/${target.id}/tasks`,
            {
                data: {
                    title: 'Проверка дайджеста',
                    description: 'Задача, созданная сквозным тестом',
                    deadline: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
                },
            }
        )
        expect(created.ok(), await created.text()).toBeTruthy()
        await curatorContext.close()

        // The notification is unread, so after the wait the digest job mails it.
        let message: Message | undefined
        await expect
            .poll(
                async () => {
                    const messages = await inboxOf(request, client.email)
                    message = messages[0]
                    return messages.length
                },
                {
                    message: 'no digest arrived for the client',
                    timeout: 60_000,
                    intervals: [1000],
                }
            )
            .toBeGreaterThan(0)

        // One message covering what happened, not one per event.
        expect(message!.Subject).toMatch(/новое событие|новых события|новых событий/)

        const full = await request.get(`${MAILPIT}/api/v1/message/${message!.ID}`)
        const html = (await full.json()).HTML as string
        expect(html).toContain('Проверка дайджеста')

        const unsubscribe = html.match(/https?:\/\/[^"']*\/unsubscribe\?token=[^"']+/)?.[0]
        expect(unsubscribe, 'the digest carried no unsubscribe link').toBeTruthy()

        // The link works without a session — an unsubscribe that demands a
        // password is not an unsubscribe.
        const anonymous = await browser.newContext()
        try {
            const page = await anonymous.newPage()
            await page.goto(unsubscribe!.replace(/^https?:\/\/[^/]+/, baseURL!))
            await expect(page.getByText('Писем больше не будет')).toBeVisible({ timeout: 15000 })
        } finally {
            await anonymous.close()
        }

        // And it took effect: the setting now reads as unsubscribed.
        const clientContext = await browser.newContext()
        try {
            await signIn(clientContext, baseURL!, 'client')
            const prefs = await clientContext.request.get(
                `${baseURL}/api/v1/notifications/delivery-preferences`
            )
            expect((await prefs.json()).data.emailUnsubscribed).toBe(true)

            // Put it back, so the rest of the suite starts where the seed left it.
            const current = (await prefs.json()).data
            await clientContext.request.put(`${baseURL}/api/v1/notifications/delivery-preferences`, {
                data: { ...current, emailUnsubscribed: false },
            })
        } finally {
            await clientContext.close()
        }
    })

    test('a notification read in time is not mailed', async ({ browser, request, baseURL }) => {
        test.slow()

        const client = getAccount('client')
        const before = (await inboxOf(request, client.email)).length

        const curatorContext = await browser.newContext()
        await signIn(curatorContext, baseURL!, 'curator')
        const clients = await curatorContext.request.get(`${baseURL}/api/v1/curator/clients`)
        const roster = (await clients.json()).data ?? []
        const target = roster.find((c: { email?: string }) => c.email === client.email) ?? roster[0]

        await curatorContext.request.post(`${baseURL}/api/v1/curator/clients/${target.id}/tasks`, {
            data: {
                title: 'Прочитанная вовремя',
                description: 'Эту задачу клиент увидит сразу',
                deadline: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
            },
        })
        await curatorContext.close()

        // Read everything at once, before the wait expires.
        const clientContext = await browser.newContext()
        try {
            await signIn(clientContext, baseURL!, 'client')
            await clientContext.request.post(`${baseURL}/api/v1/notifications/mark-all-read`, {
                data: { category: 'main' },
            })
        } finally {
            await clientContext.close()
        }

        // The email existed to catch what the application missed. It did not
        // miss this one, so nothing should arrive.
        await new Promise((resolve) => setTimeout(resolve, 20_000))
        expect(await inboxOf(request, client.email)).toHaveLength(before)
    })
})
