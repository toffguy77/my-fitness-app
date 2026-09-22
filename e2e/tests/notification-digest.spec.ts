import { test, expect, signIn, asUser } from '../fixtures/session'
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

/** Тема дайджеста. Одна на весь файл: по ней его и отличают от прочей почты. */
const DIGEST_SUBJECT = /новое событие|новых события|новых событий/

const MAILPIT = process.env.MAILPIT_URL || 'http://localhost:8025'

// This file drives everything through the API and one page; a session handed
// to it by the fixture would belong to the wrong person half the time.
test.use({ role: undefined })

interface Message {
    ID: string
    Subject: string
    To: { Address: string }[]
}

/** Notes a created task so it can be removed when the test is done. */
function rememberTask(
    body: { data?: { id?: string } },
    clientId: string,
    token: string
): void {
    const taskId = body?.data?.id
    if (taskId) createdTasks.push({ clientId, taskId, token })
}

const createdTasks: { clientId: string; taskId: string; token: string }[] = []

/** Everything the catcher has for one address, newest first. */
async function inboxOf(request: import('@playwright/test').APIRequestContext, address: string) {
    const response = await request.get(`${MAILPIT}/api/v1/search?query=${encodeURIComponent('to:' + address)}`)
    if (!response.ok()) return [] as Message[]
    const body = await response.json()
    return (body.messages ?? []) as Message[]
}

// One account, one inbox, one set of unread notifications: run in order.
// In parallel the second test marks everything read — including the
// notification the first one is waiting to be mailed about.
test.describe.configure({ mode: 'serial' })

test.describe('Notification digest', () => {
    test.beforeAll(async ({ request }) => {
        // Start from an empty inbox so "the newest message" means this test's.
        await request.delete(`${MAILPIT}/api/v1/messages`).catch(() => {})
    })

    // Whatever happens, email goes back on. A failure between unsubscribing
    // and restoring would leave the account unsubscribed, and every retry
    // would then fail for a different reason — no email could arrive at all.
    test.afterEach(async ({ browser, baseURL }) => {
        // The curator tests read the same client's task list. A list this file
        // keeps adding to is a list whose buttons move under them.
        if (createdTasks.length > 0) {
            const cleanup = await browser.newContext()
            try {
                for (const task of createdTasks.splice(0)) {
                    await cleanup.request.delete(
                        `${baseURL}/api/v1/curator/clients/${task.clientId}/tasks/${task.taskId}`,
                        { headers: asUser(task.token) }
                    )
                }
            } finally {
                await cleanup.close()
            }
        }

        const context = await browser.newContext()
        try {
            const token = await signIn(context, baseURL!, 'client')
            const prefs = await context.request.get(
                `${baseURL}/api/v1/notifications/delivery-preferences`,
                { headers: asUser(token) }
            )
            const current = (await prefs.json()).data
            if (current?.emailUnsubscribed) {
                await context.request.put(`${baseURL}/api/v1/notifications/delivery-preferences`, {
                    headers: asUser(token),
                    data: { ...current, emailUnsubscribed: false },
                })
            }
        } finally {
            await context.close()
        }
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
        const curatorToken = await signIn(curatorContext, baseURL!, 'curator')

        // Кому именно назначаем задачу, спрашиваем у самого клиента.
        //
        // Раньше нужный клиент искался в списке куратора по почте — а список
        // почты не содержит вовсе (curator/service.go отдаёт id, имя, аватар).
        // Сравнение никогда не совпадало, и срабатывал запасной `roster[0]`:
        // задача уходила произвольному клиенту, дайджест — ему же, а тест
        // ждал письма на адрес своего клиента и сообщал «дайджест не пришёл».
        // Пока у куратора был один клиент, запасной вариант совпадал с
        // нужным, и подмена не проявлялась.
        const clientContextForId = await browser.newContext()
        let clientId: number
        try {
            const clientToken = await signIn(clientContextForId, baseURL!, 'client')
            const profile = await clientContextForId.request.get(
                `${baseURL}/api/v1/users/profile`,
                { headers: asUser(clientToken) },
            )
            expect(profile.ok(), await profile.text()).toBeTruthy()
            clientId = (await profile.json()).data.profile.id
        } finally {
            await clientContextForId.close()
        }

        // Условие проверки создаётся ею самой, а не наследуется от соседей.
        //
        // Дайджест уходит только по тем событиям, у которых для человека
        // включён канал «почта». У клиента прогона `task_assigned.email`
        // оказывался выключен — его гасит соседний тест настроек
        // уведомлений, — и дайджест не отправлялся вовсе. Тест при этом
        // сообщал «дайджест не пришёл»: правда, но не про дайджест.
        const prefsContext = await browser.newContext()
        let restorePreferences: (() => Promise<void>) | null = null
        try {
            const prefsToken = await signIn(prefsContext, baseURL!, 'client')
            const before = await prefsContext.request.get(
                `${baseURL}/api/v1/notifications/delivery-preferences`,
                { headers: asUser(prefsToken) },
            )
            expect(before.ok(), await before.text()).toBeTruthy()
            const original = (await before.json()).data

            const withEmail = {
                ...original,
                types: original.types.map((t: { type: string }) =>
                    t.type === 'task_assigned' ? { ...t, email: true } : t,
                ),
            }
            await prefsContext.request.put(
                `${baseURL}/api/v1/notifications/delivery-preferences`,
                { headers: asUser(prefsToken), data: withEmail },
            )

            // Возвращаем как было — прогон не должен менять настройки учётки.
            restorePreferences = async () => {
                await prefsContext.request.put(
                    `${baseURL}/api/v1/notifications/delivery-preferences`,
                    { headers: asUser(prefsToken), data: original },
                )
                await prefsContext.close()
            }
        } catch (error) {
            await prefsContext.close()
            throw error
        }

        const clients = await curatorContext.request.get(`${baseURL}/api/v1/curator/clients`, {
            headers: asUser(curatorToken),
        })
        expect(clients.ok(), await clients.text()).toBeTruthy()
        const roster = (await clients.json()).data ?? []
        const target = roster.find((c: { id: number }) => c.id === clientId)
        expect(target, 'клиент прогона не в списке этого куратора').toBeTruthy()

        const created = await curatorContext.request.post(
            `${baseURL}/api/v1/curator/clients/${target.id}/tasks`,
            {
                headers: asUser(curatorToken),
                data: {
                    title: 'Проверка дайджеста',
                    type: 'habit',
                    description: 'Задача, созданная сквозным тестом',
                    deadline: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
                    recurrence: 'once',
                },
            }
        )
        expect(created.ok(), await created.text()).toBeTruthy()
        rememberTask(await created.json(), String(target.id), curatorToken)
        await curatorContext.close()

        // The notification is unread, so after the wait the digest job mails it.
        // Ждём именно дайджест, а не первое попавшееся письмо.
        //
        // Раньше ожидалось «письмо появилось», а тема проверялась отдельной
        // строкой. Пока набор идёт в один поток, первым письмом и был
        // дайджест; в несколько потоков в тот же ящик успевает прийти
        // уведомление о входе («Вход в BURCEV») — оно приходит на каждый вход,
        // а входов в наборе больше двухсот. Тест падал на чужом письме и
        // сообщал «дайджест не пришёл», хотя дайджест приходил следом.
        //
        // Само ожидание и есть доказательство: не пришёл — истечёт срок.
        let message: Message | undefined
        await expect
            .poll(
                async () => {
                    const messages = await inboxOf(request, client.email)
                    message = messages.find((m) => DIGEST_SUBJECT.test(m.Subject))
                    return message ? 1 : 0
                },
                {
                    message: 'no digest arrived for the client',
                    timeout: 60_000,
                    intervals: [1000],
                }
            )
            .toBeGreaterThan(0)

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
            const clientToken = await signIn(clientContext, baseURL!, 'client')
            const prefs = await clientContext.request.get(
                `${baseURL}/api/v1/notifications/delivery-preferences`,
                { headers: asUser(clientToken) }
            )
            const current = (await prefs.json()).data
            expect(current.emailUnsubscribed).toBe(true)

            // Put it back, so the rest of the suite starts where the seed left it.
            await clientContext.request.put(`${baseURL}/api/v1/notifications/delivery-preferences`, {
                headers: asUser(clientToken),
                data: { ...current, emailUnsubscribed: false },
            })
        } finally {
            await clientContext.close()
            // Канал письма возвращается в исходное состояние в любом случае:
            // тест, меняющий настройки учётки и падающий на полпути, оставил
            // бы их за собой следующему.
            await restorePreferences?.()
        }
    })

    test('a notification read in time is not mailed', async ({ browser, request, baseURL }) => {
        test.slow()

        const client = getAccount('client')
        // Считаем дайджесты, а не письма вообще: в тот же ящик за двадцать
        // секунд ожидания успевает прийти уведомление о входе — его шлёт
        // любой соседний тест, входящий под этой учёткой, — и счёт всей
        // почты рос без всякого дайджеста.
        const digestsBefore = (await inboxOf(request, client.email)).filter((m) =>
            DIGEST_SUBJECT.test(m.Subject),
        ).length

        const curatorContext = await browser.newContext()
        const curatorToken = await signIn(curatorContext, baseURL!, 'curator')
        const clients = await curatorContext.request.get(`${baseURL}/api/v1/curator/clients`, {
            headers: asUser(curatorToken),
        })
        const roster = (await clients.json()).data ?? []
        const target = roster.find((c: { email?: string }) => c.email === client.email) ?? roster[0]

        const secondTask = await curatorContext.request.post(`${baseURL}/api/v1/curator/clients/${target.id}/tasks`, {
            headers: asUser(curatorToken),
            data: {
                title: 'Прочитанная вовремя',
                type: 'habit',
                description: 'Эту задачу клиент увидит сразу',
                deadline: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
                recurrence: 'once',
            },
        })
        rememberTask(await secondTask.json(), String(target.id), curatorToken)
        await curatorContext.close()

        // Read everything at once, before the wait expires.
        const clientContext = await browser.newContext()
        try {
            const clientToken = await signIn(clientContext, baseURL!, 'client')
            await clientContext.request.post(`${baseURL}/api/v1/notifications/mark-all-read`, {
                headers: asUser(clientToken),
                data: { category: 'main' },
            })
        } finally {
            await clientContext.close()
        }

        // The email existed to catch what the application missed. It did not
        // miss this one, so nothing should arrive.
        await new Promise((resolve) => setTimeout(resolve, 20_000))
        const digestsAfter = (await inboxOf(request, client.email)).filter((m) =>
            DIGEST_SUBJECT.test(m.Subject),
        ).length
        expect(digestsAfter, 'прочитанное вовремя уведомление всё равно ушло письмом').toBe(
            digestsBefore,
        )
    })
})
