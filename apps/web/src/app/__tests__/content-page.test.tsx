/**
 * The article feed page: the first page of articles is fetched on the server,
 * so the links to them are in the HTML a search engine reads.
 */

import React from 'react'
import { render, screen } from '@testing-library/react'

const mockFeedList = jest.fn()
jest.mock('@/features/content/components/FeedList', () => ({
    FeedList: (props: { initialArticles?: unknown[]; initialTotal?: number }) => {
        mockFeedList(props)
        return <div data-testid="feed-list">FeedList</div>
    },
}))

import ContentFeedPage from '../content/page'

const articles = [{ id: 'a1', slug: 'pervaya', title: 'Первая', excerpt: '', category: 'general', author_name: 'x' }]

describe('ContentFeedPage', () => {
    beforeEach(() => {
        mockFeedList.mockClear()
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ data: { articles, total: 12 } }),
        })
    })

    it('renders the page title', async () => {
        render(await ContentFeedPage())
        expect(screen.getByText('Статьи')).toBeInTheDocument()
    })

    it('hands the first page of the public feed to the list', async () => {
        render(await ContentFeedPage())

        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringMatching(/\/api\/v1\/public\/content\?limit=20&offset=0$/),
            expect.anything(),
        )
        expect(mockFeedList).toHaveBeenCalledWith({ initialArticles: articles, initialTotal: 12 })
    })

    // Не из кэша: при stale-while-revalidate первый посетитель после паузы —
    // а на тихом сайте это обычно робот — получал прошлый снимок ленты, без
    // только что опубликованной статьи.
    it('asks the API afresh on every request', async () => {
        render(await ContentFeedPage())

        expect(global.fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ cache: 'no-store' }))
    })

    // Без начальных данных лента загрузится в браузере, как раньше: падение
    // API не должно ронять страницу.
    it('leaves the list to load itself when the API fails', async () => {
        ;(global.fetch as jest.Mock).mockRejectedValue(new Error('down'))

        render(await ContentFeedPage())

        expect(screen.getByTestId('feed-list')).toBeInTheDocument()
        expect(mockFeedList).toHaveBeenCalledWith({})
    })
})
