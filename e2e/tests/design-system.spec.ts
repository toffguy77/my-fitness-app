import type { Page } from '@playwright/test'

import { test, expect, signIn } from '../fixtures/session'

/**
 * Дизайн-система на живом стенде — то, что юнит-тесты увидеть не могут.
 *
 * - Тема: выбор с устройства приходит в серверной разметке (без мигания) и
 *   действительно перекрашивает экран.
 * - Быстрая запись с дашборда открывает дневник сразу на нужном способе.
 * - Нижняя навигация подсвечивает вкладку по адресу у всех трёх ролей.
 * - Ни одна страница под входом не пересобирается из-за расхождения
 *   серверной и клиентской разметки (React #418).
 *
 * Сессии заводятся внутри тестов под разные роли, поэтому файл живёт в
 * проекте без предустановленной роли.
 */

/** Фон экрана — то, что видит человек, а не значение атрибута. */
async function canvasColor(page: Page): Promise<string> {
    return page.evaluate(() => getComputedStyle(document.body).backgroundColor)
}

/** Ошибки гидратации и прочие падения страницы. */
function collectPageErrors(page: Page): string[] {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    return errors
}

test.describe('Тема оформления', () => {
    test('тёмная тема из профиля приходит с сервера и переживает перезагрузку; «Авто» её снимает', async ({
        page,
        context,
        baseURL,
    }) => {
        await signIn(context, baseURL!, 'client')

        await page.goto('/profile')
        const themes = page.getByRole('radiogroup', { name: 'Тема оформления' })
        await expect(themes).toBeVisible({ timeout: 15000 })
        await expect(themes.getByRole('radio', { name: 'Авто' })).toHaveAttribute('aria-checked', 'true')
        const lightCanvas = await canvasColor(page)

        await themes.getByRole('radio', { name: 'Тёмная' }).click()
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
        await expect.poll(() => canvasColor(page)).not.toBe(lightCanvas)
        const darkCanvas = await canvasColor(page)

        // Серверная разметка уже с темой: страница не мигает светлой.
        const html = await (await context.request.get(`${baseURL}/dashboard`)).text()
        expect(html).toMatch(/<html[^>]*data-theme="dark"/)

        await page.goto('/dashboard')
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
        expect(await canvasColor(page)).toBe(darkCanvas)

        await page.goto('/profile')
        await page.getByRole('radiogroup', { name: 'Тема оформления' }).getByRole('radio', { name: 'Авто' }).click()
        await expect(page.locator('html')).not.toHaveAttribute('data-theme')
        const cookies = await context.cookies()
        expect(cookies.find((cookie) => cookie.name === 'theme')).toBeUndefined()
    })

    test('«Авто» следует системной настройке', async ({ browser, baseURL }) => {
        const dark = await browser.newContext({ colorScheme: 'dark' })
        const light = await browser.newContext({ colorScheme: 'light' })
        try {
            const darkPage = await dark.newPage()
            const lightPage = await light.newPage()
            await darkPage.goto(`${baseURL}/auth`)
            await lightPage.goto(`${baseURL}/auth`)
            expect(await canvasColor(darkPage)).not.toBe(await canvasColor(lightPage))
        } finally {
            await dark.close()
            await light.close()
        }
    })
})

test.describe('Быстрая запись с дашборда', () => {
    for (const [button, method] of [
        ['Записать еду', 'search'],
        ['Распознать еду по фото', 'photo'],
        ['Сканировать штрихкод', 'barcode'],
    ] as const) {
        test(`«${button}» открывает дневник на способе ${method}`, async ({ page, context, baseURL }) => {
            await signIn(context, baseURL!, 'client')
            await page.goto('/dashboard')

            await page.getByRole('button', { name: button }).click()

            await expect(page).toHaveURL(new RegExp(`/food-tracker\\?date=\\d{4}-\\d{2}-\\d{2}&add=${method}`))
            const dialog = page.getByRole('dialog')
            await expect(dialog).toBeVisible({ timeout: 15000 })
            await expect(dialog.locator(`#tab-${method}`)).toHaveAttribute('aria-selected', 'true')
        })
    }
})

test.describe('Нижняя навигация следует адресу', () => {
    const cases = {
        client: [
            ['/food-tracker', 'nav-item-food-tracker'],
            ['/chat', 'nav-item-chat'],
            ['/content', 'nav-item-content'],
        ],
        curator: [
            ['/curator', 'nav-item-hub'],
            ['/curator/chat', 'nav-item-chats'],
            ['/curator/content', 'nav-item-content'],
            ['/curator/leads', 'nav-item-leads'],
            ['/curator/support', 'nav-item-support'],
        ],
        admin: [
            ['/admin', 'nav-item-dashboard'],
            ['/admin/users', 'nav-item-users'],
            ['/admin/content', 'nav-item-content'],
            ['/admin/chats', 'nav-item-chats'],
        ],
    } as const

    for (const [role, routes] of Object.entries(cases) as [keyof typeof cases, (typeof cases)[keyof typeof cases]][]) {
        test(`${role}: подсвечена вкладка своего раздела, и только она`, async ({ page, context, baseURL }) => {
            await signIn(context, baseURL!, role)
            for (const [path, testId] of routes) {
                await page.goto(path)
                const current = page.locator('nav [aria-current="page"]')
                await expect(current, `${path}`).toHaveCount(1, { timeout: 15000 })
                await expect(current).toHaveAttribute('data-testid', testId)
            }
        })
    }

    test('client: профиль не принадлежит ни одной вкладке', async ({ page, context, baseURL }) => {
        await signIn(context, baseURL!, 'client')
        await page.goto('/profile')
        await expect(page.getByTestId('footer-navigation')).toBeVisible({ timeout: 15000 })
        await expect(page.locator('nav [aria-current="page"]')).toHaveCount(0)
    })
})

test.describe('Загрузка страниц под входом', () => {
    // Ошибка проявлялась со второй страницы: первая наполняла кэш профиля, а
    // следующие рисовали его ещё до гидратации.
    const routes = {
        client: ['/dashboard', '/food-tracker', '/chat', '/notifications', '/content', '/profile', '/settings/profile'],
        curator: ['/curator', '/curator/chat', '/curator/content', '/curator/leads', '/curator/support'],
        admin: ['/admin', '/admin/users', '/admin/chats', '/admin/content', '/admin/jobs'],
    } as const

    for (const [role, paths] of Object.entries(routes) as [keyof typeof routes, readonly string[]][]) {
        test(`${role}: страницы открываются без расхождения серверной и клиентской разметки`, async ({
            page,
            context,
            baseURL,
        }) => {
            await signIn(context, baseURL!, role)
            const errors = collectPageErrors(page)
            // Токен доступа живёт в памяти вкладки: каждая загрузка начинает
            // без него. Запросы, ушедшие до обновления сессии, возвращались 401
            // и обновляли её второй раз — теперь они ждут одно обновление.
            const unauthorised: string[] = []
            page.on('response', (response) => {
                if (response.status() === 401 && response.url().includes('/api/')) unauthorised.push(new URL(response.url()).pathname)
            })
            // Одинаковые чтения за одну загрузку: оболочка, шапка и блоки
            // спрашивали одно и то же сами — план недели, задачи и счётчики
            // уходили по два–четыре раза на каждой странице.
            let reads = new Map<string, number>()
            page.on('request', (request) => {
                if (request.method() !== 'GET' || !request.url().includes('/api/v1/')) return
                const url = new URL(request.url())
                const key = url.pathname + url.search
                reads.set(key, (reads.get(key) ?? 0) + 1)
            })
            const repeated: string[] = []
            for (const path of paths) {
                reads = new Map()
                await page.goto(path)
                await page.waitForLoadState('load')
                // Гидратация завершается после загрузки скриптов; ошибка
                // приходит асинхронно, поэтому даём ей время проявиться.
                await page.waitForTimeout(1500)
                for (const [key, count] of reads) if (count > 1) repeated.push(`${path}: ${key} ×${count}`)
            }
            expect(repeated, 'страница не спрашивает одно и то же дважды').toEqual([])
            expect(errors.filter((message) => /#418|#423|#425|[Hh]ydrat/.test(message))).toEqual([])
            expect(unauthorised, 'запросы под входом не уходят без токена').toEqual([])
        })
    }
})
