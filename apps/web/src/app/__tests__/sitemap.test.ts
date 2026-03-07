import sitemap from '../sitemap'

describe('sitemap', () => {
    beforeEach(() => {
        global.fetch = jest.fn()
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('returns static pages', async () => {
        ;(global.fetch as jest.Mock).mockResolvedValue({
            ok: false,
        })

        const result = await sitemap()

        const urls = result.map((entry) => entry.url)
        expect(urls).toContain('https://burcev.team')
        expect(urls).toContain('https://burcev.team/auth')
        expect(urls).toContain('https://burcev.team/content')
        expect(urls).toContain('https://burcev.team/legal/terms')
        expect(urls).toContain('https://burcev.team/legal/privacy')
    })

    it('sets correct priorities for static pages', async () => {
        ;(global.fetch as jest.Mock).mockResolvedValue({ ok: false })

        const result = await sitemap()

        const homePage = result.find((entry) => entry.url === 'https://burcev.team')
        expect(homePage?.priority).toBe(1.0)

        const contentPage = result.find((entry) => entry.url === 'https://burcev.team/content')
        expect(contentPage?.priority).toBe(0.8)

        const authPage = result.find((entry) => entry.url === 'https://burcev.team/auth')
        expect(authPage?.priority).toBe(0.5)
    })

    it('includes article pages from API', async () => {
        ;(global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            json: () =>
                Promise.resolve({
                    data: {
                        articles: [
                            { id: 'article-1', published_at: '2026-03-01T12:00:00Z' },
                            { id: 'article-2' },
                        ],
                    },
                }),
        })

        const result = await sitemap()

        const urls = result.map((entry) => entry.url)
        expect(urls).toContain('https://burcev.team/content/article-1')
        expect(urls).toContain('https://burcev.team/content/article-2')
    })

    it('sets article priority and change frequency', async () => {
        ;(global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            json: () =>
                Promise.resolve({
                    data: {
                        articles: [
                            { id: 'article-1', published_at: '2026-03-01T12:00:00Z' },
                        ],
                    },
                }),
        })

        const result = await sitemap()

        const articleEntry = result.find((entry) =>
            entry.url === 'https://burcev.team/content/article-1'
        )
        expect(articleEntry?.priority).toBe(0.6)
        expect(articleEntry?.changeFrequency).toBe('monthly')
    })

    it('returns static-only sitemap when API fails', async () => {
        ;(global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'))

        const result = await sitemap()

        expect(result).toHaveLength(5)
        expect(result.every((entry) => !entry.url.includes('/content/'))).toBeTruthy()
    })

    it('returns static-only sitemap when API returns non-ok', async () => {
        ;(global.fetch as jest.Mock).mockResolvedValue({ ok: false })

        const result = await sitemap()
        expect(result).toHaveLength(5)
    })

    it('handles empty articles array from API', async () => {
        ;(global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ data: { articles: [] } }),
        })

        const result = await sitemap()
        expect(result).toHaveLength(5)
    })
})
