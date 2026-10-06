import sitemap, * as sitemapModule from '../sitemap'

const SITE = 'https://burcev.team'

function card(i: number, extra: Record<string, unknown> = {}) {
    return { id: `id-${i}`, slug: `statya-${i}`, published_at: '2026-03-01T12:00:00Z', ...extra }
}

/** A public feed of `count` articles, answered a page at a time as the API does. */
function feedOf(count: number) {
    const all = Array.from({ length: count }, (_, i) => card(i + 1))
    return jest.fn((url: string) => {
        const params = new URL(url).searchParams
        const limit = Math.min(Number(params.get('limit')), 100)
        const offset = Number(params.get('offset') ?? 0)
        return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ data: { articles: all.slice(offset, offset + limit), total: count } }),
        })
    })
}

describe('sitemap', () => {
    beforeEach(() => {
        global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 })
        jest.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    // Собранная при `next build` карта уезжала в образ без единой статьи: API
    // при сборке недоступен. Карта обязана строиться при запросе.
    it('is built when requested, not when the app is built', () => {
        expect(sitemapModule.dynamic).toBe('force-dynamic')
    })

    it('lists the public pages, the calculator and the author', async () => {
        const urls = (await sitemap()).map((e) => e.url)

        for (const path of ['', '/pricing', '/content', '/kalkulyator-kbzhu', '/avtor/sergey-burcev', '/legal/terms', '/legal/privacy']) {
            expect(urls).toContain(`${SITE}${path}`)
        }
    })

    // /auth помечен noindex: страница в карте и запрет индексации в ней же —
    // противоречие, которое Вебмастер показывает ошибкой.
    it('leaves the sign-in page out', async () => {
        const urls = (await sitemap()).map((e) => e.url)

        expect(urls.some((u) => u.includes('/auth'))).toBe(false)
    })

    it('does not claim the static pages changed just now', async () => {
        const result = await sitemap()

        const statics = result.filter((e) => !e.url.includes('/content/'))
        expect(statics.length).toBeGreaterThan(0)
        for (const entry of statics) {
            expect(entry.lastModified).toBeUndefined()
        }
    })

    it('walks the public feed page by page until it has every article', async () => {
        global.fetch = feedOf(150) as unknown as typeof fetch

        const articles = (await sitemap()).filter((e) => e.url.includes('/content/'))

        expect(articles).toHaveLength(150)
        expect(new Set(articles.map((a) => a.url)).size).toBe(150)
    })

    it('addresses articles by slug', async () => {
        global.fetch = feedOf(1) as unknown as typeof fetch

        const urls = (await sitemap()).map((e) => e.url)

        expect(urls).toContain(`${SITE}/content/statya-1`)
        expect(urls.some((u) => u.includes('id-1'))).toBe(false)
    })

    it('dates an article by its last change', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () =>
                Promise.resolve({
                    data: {
                        articles: [card(1, { published_at: '2026-03-01T12:00:00Z', updated_at: '2026-03-05T12:00:00Z' })],
                        total: 1,
                    },
                }),
        })

        const entry = (await sitemap()).find((e) => e.url.endsWith('/content/statya-1'))

        expect(entry?.lastModified).toEqual(new Date('2026-03-05T12:00:00Z'))
    })

    it('still answers, without articles, when the API fails — and says so in the log', async () => {
        global.fetch = jest.fn().mockRejectedValue(new Error('connection refused'))

        const result = await sitemap()

        expect(result.length).toBeGreaterThan(0)
        expect(result.some((e) => e.url.includes('/content/'))).toBe(false)
        expect(console.error).toHaveBeenCalled()
    })

    it('stops walking if the API keeps answering full pages', async () => {
        const endless = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () =>
                Promise.resolve({ data: { articles: Array.from({ length: 100 }, (_, i) => card(i)), total: 1e9 } }),
        })
        global.fetch = endless as unknown as typeof fetch

        await sitemap()

        expect(endless.mock.calls.length).toBeLessThanOrEqual(50)
    })
})
