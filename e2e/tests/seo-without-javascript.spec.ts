import { test, expect, signIn, asUser } from '../fixtures/session'

/**
 * Что получает робот, который не исполняет JavaScript.
 *
 * SEO-аудит проверял именно так — запросом страницы без скриптов — и находил
 * пустоту: ни заголовка статьи, ни ссылок в ленте, калькулятор закрыт. Модульные
 * тесты видят разметку компонентов, но не то, что лежит в HTML первого ответа;
 * это видит только настоящий запрос.
 *
 * Тело статьи здесь не проверяется: оно хранится в S3, а у прогона хранилища
 * нет. Его проверяет запрос к стенду после выкатки (задача 3.2 спеки
 * seo-article-server-render).
 */

test.describe('Публичные страницы без JavaScript', () => {
    let articleId = ''
    let slug = ''
    let curatorToken = ''
    const title = `Проверка без скриптов ${Date.now()}`
    const excerpt = 'Анонс статьи, который должен быть в HTML первого ответа.'

    test.beforeAll(async ({ browser, baseURL }) => {
        const context = await browser.newContext()
        curatorToken = await signIn(context, baseURL!, 'curator')
        const headers = { ...asUser(curatorToken), 'content-type': 'application/json' }

        const created = await context.request.post(`${baseURL}/api/v1/content/articles`, {
            headers,
            data: { title, excerpt, category: 'nutrition', audience_scope: 'all' },
        })
        expect(created.ok(), `статью не создать: ${await created.text()}`).toBeTruthy()
        const body = await created.json()
        articleId = body.data.id
        slug = body.data.slug
        expect(slug, 'статья создана без адреса').toMatch(/^[a-z0-9-]+$/)

        const published = await context.request.post(
            `${baseURL}/api/v1/content/articles/${articleId}/publish`,
            { headers },
        )
        expect(published.ok(), `статью не опубликовать: ${await published.text()}`).toBeTruthy()
        await context.close()
    })

    test.afterAll(async ({ browser, baseURL }) => {
        if (!articleId) return
        const context = await browser.newContext()
        const token = await signIn(context, baseURL!, 'curator')
        await context.request.delete(`${baseURL}/api/v1/content/articles/${articleId}`, {
            headers: asUser(token),
        })
        await context.close()
    })

    test.use({ javaScriptEnabled: false })

    test('статья отдаёт заголовок, анонс, автора и призыв в HTML', async ({ page }) => {
        const response = await page.goto(`/content/${slug}`)
        expect(response?.status()).toBe(200)

        await expect(page.getByRole('heading', { level: 1 })).toHaveText(title)
        await expect(page.getByRole('link', { name: 'Сергей Бурцев' })).toHaveAttribute(
            'href',
            '/avtor/sergey-burcev',
        )
        await expect(page.getByRole('link', { name: 'Рассчитать мою норму' })).toHaveAttribute(
            'href',
            '/kalkulyator-kbzhu',
        )
        await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
            'href',
            `https://burcev.team/content/${slug}`,
        )
        const html = await page.content()
        expect(html).toContain(excerpt)
    })

    test('старый адрес статьи отвечает постоянным редиректом на новый', async ({ request }) => {
        const response = await request.get(`/content/${articleId}`, { maxRedirects: 0 })

        expect(response.status()).toBe(301)
        expect(response.headers()['location']).toMatch(new RegExp(`/content/${slug}$`))
    })

    test('несуществующая статья отвечает 404', async ({ request }) => {
        const response = await request.get('/content/takoy-stati-net-i-ne-bylo')

        expect(response.status()).toBe(404)
    })

    test('лента содержит ссылку на опубликованную статью', async ({ page }) => {
        await page.goto('/content')

        await expect(page.locator(`a[href="/content/${slug}"]`)).toHaveCount(1)
    })

    test('калькулятор отдаёт заголовок, текст и вопросы', async ({ page }) => {
        const response = await page.goto('/kalkulyator-kbzhu')
        expect(response?.status()).toBe(200)

        await expect(page.getByRole('heading', { level: 1 })).toContainText('Калькулятор КБЖУ')
        await expect(page.getByText(/формулу Миффлина/)).toBeVisible()
        await expect(page.getByRole('heading', { name: 'Вопросы и ответы' })).toBeVisible()
        expect(await page.content()).toContain('"FAQPage"')
    })

    test('robots.txt не закрывает калькулятор и не несёт мёртвых директив', async ({ request }) => {
        const robots = await (await request.get('/robots.txt')).text()

        expect(robots).not.toMatch(/^Host:/m)
        expect(robots).not.toMatch(/^Crawl-delay:/m)
        expect(robots).not.toMatch(/^Disallow: \/kalkulyator/m)
        expect(robots).toMatch(/^Sitemap: https:\/\/burcev\.team\/sitemap\.xml$/m)
    })
})
