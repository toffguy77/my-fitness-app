/**
 * The public article page: what a search engine gets in the first response.
 */

import { render, screen } from '@testing-library/react'
import ArticlePage, { generateMetadata } from '../content/[id]/page'

jest.mock('react-markdown', () => ({
    __esModule: true,
    default: ({ children }: { children: string }) => <div data-testid="markdown">{children}</div>,
}))
jest.mock('remark-gfm', () => ({ __esModule: true, default: jest.fn() }))

jest.mock('@/features/content/components/ArticleView', () => ({
    ArticleView: ({ articleId }: { articleId: string }) => (
        <div data-testid="client-article-view">{articleId}</div>
    ),
}))

jest.mock('@/shared/analytics', () => ({
    track: jest.fn(),
    EVENTS: jest.requireActual('@/shared/analytics/events').EVENTS,
}))

const notFoundError = new Error('NEXT_NOT_FOUND')
jest.mock('next/navigation', () => ({
    notFound: () => {
        throw notFoundError
    },
}))

const UUID = 'f4a2a36d-53ed-428a-aa27-4c31a66fd960'

const article = {
    id: UUID,
    slug: 'chto-takoe-kbzhu-i-zachem-ego-schitat',
    author_id: 1,
    author_name: 'Красный Кот',
    title: 'Что такое КБЖУ и зачем его считать?',
    excerpt: 'Коротко о калориях и макронутриентах',
    category: 'nutrition',
    status: 'published',
    audience_scope: 'all',
    body: '## Зачем считать\n\nКБЖУ — это калории, белки, жиры и углеводы.',
    is_own: false,
    published_at: '2026-03-08T08:20:26Z',
    created_at: '2026-03-08T08:20:26Z',
    updated_at: '2026-03-09T10:00:00Z',
}

function answer(status: number, body?: unknown) {
    return Promise.resolve({
        ok: status >= 200 && status < 300,
        status,
        json: () => Promise.resolve(body),
    })
}

const params = (id: string) => ({ params: Promise.resolve({ id }) })

function jsonLdBlocks(container: HTMLElement) {
    return Array.from(container.querySelectorAll('script[type="application/ld+json"]')).map((s) =>
        JSON.parse(s.innerHTML),
    )
}

describe('the public article page', () => {
    beforeEach(() => {
        global.fetch = jest.fn()
    })

    describe('a public article', () => {
        beforeEach(() => {
            ;(global.fetch as jest.Mock).mockImplementation(() => answer(200, { data: article }))
        })

        it('reads the article afresh, so an edit is what the next reader sees', async () => {
            await ArticlePage(params(article.slug))

            expect(global.fetch).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({ cache: 'no-store' }),
            )
        })

        it('renders the title and the body on the server, without the client view', async () => {
            const { container } = render(await ArticlePage(params(article.slug)))

            expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(article.title)
            expect(screen.getByTestId('markdown')).toHaveTextContent('КБЖУ — это калории')
            expect(screen.queryByTestId('client-article-view')).not.toBeInTheDocument()
            expect(container.querySelector('article')).toBeInTheDocument()
        })

        it('is signed by the expert, not by the account it was created under', async () => {
            render(await ArticlePage(params(article.slug)))

            expect(screen.getByRole('link', { name: 'Сергей Бурцев' })).toHaveAttribute(
                'href',
                '/avtor/sergey-burcev',
            )
            expect(screen.queryByText(/Красный Кот/)).not.toBeInTheDocument()
        })

        it('ends with the way on: the calculator and the pricing', async () => {
            render(await ArticlePage(params(article.slug)))

            expect(screen.getByRole('link', { name: 'Рассчитать мою норму' })).toHaveAttribute(
                'href',
                '/kalkulyator-kbzhu',
            )
            expect(screen.getByRole('link', { name: 'Тарифы' })).toHaveAttribute('href', '/pricing')
        })

        it('keeps the call to action when the article has no body', async () => {
            ;(global.fetch as jest.Mock).mockImplementation(() =>
                answer(200, { data: { ...article, body: undefined } }),
            )
            render(await ArticlePage(params(article.slug)))

            expect(screen.getByRole('link', { name: 'Рассчитать мою норму' })).toBeInTheDocument()
        })

        it('marks the author as a person, with his page', async () => {
            const { container } = render(await ArticlePage(params(article.slug)))

            const ld = jsonLdBlocks(container).find((b) => b['@type'] === 'Article')
            expect(ld.author).toEqual({
                '@type': 'Person',
                name: 'Сергей Бурцев',
                jobTitle: 'Спортивный практикующий тренер, мастер спорта по тяжёлой атлетике',
                url: 'https://burcev.team/avtor/sergey-burcev',
                image: 'https://burcev.team/authors/sergey-burcev.jpg',
            })
            expect(ld.mainEntityOfPage).toBe(`https://burcev.team/content/${article.slug}`)
        })

        it('marks the way to it as breadcrumbs', async () => {
            const { container } = render(await ArticlePage(params(article.slug)))

            const crumbs = jsonLdBlocks(container).find((b) => b['@type'] === 'BreadcrumbList')
            expect(crumbs.itemListElement.map((i: { item: string }) => i.item)).toEqual([
                'https://burcev.team',
                'https://burcev.team/content',
                `https://burcev.team/content/${article.slug}`,
            ])
        })

        it('names its readable address as canonical', async () => {
            const meta = await generateMetadata(params(article.slug))

            expect(meta.alternates?.canonical).toBe(`https://burcev.team/content/${article.slug}`)
            expect((meta.openGraph as { url?: string }).url).toBe(
                `https://burcev.team/content/${article.slug}`,
            )
            expect(meta.robots).toBeUndefined()
        })
    })

    describe('an address nobody can open', () => {
        beforeEach(() => {
            ;(global.fetch as jest.Mock).mockImplementation(() => answer(404, { error: 'not found' }))
        })

        it('answers 404 for an unknown slug', async () => {
            await expect(ArticlePage(params('takoy-stati-net'))).rejects.toBe(notFoundError)
        })
    })

    describe('an article meant for one curator’s clients', () => {
        beforeEach(() => {
            ;(global.fetch as jest.Mock).mockImplementation(() => answer(404, { error: 'not found' }))
        })

        it('is handed to the signed-in reader in the browser', async () => {
            render(await ArticlePage(params(UUID)))

            expect(screen.getByTestId('client-article-view')).toHaveTextContent(UUID)
        })

        it('is kept out of search', async () => {
            const meta = await generateMetadata(params(UUID))

            expect(meta.robots).toEqual({ index: false, follow: false })
        })
    })

    // A failing API is not a missing article: "not found" would tell search
    // engines to drop a page that exists.
    it('does not turn a failing API into a 404', async () => {
        ;(global.fetch as jest.Mock).mockImplementation(() => answer(500))

        const outcome = ArticlePage(params(article.slug))
        await expect(outcome).rejects.toThrow()
        await expect(outcome).rejects.not.toBe(notFoundError)
    })
})
