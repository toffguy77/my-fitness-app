/**
 * Unit tests for FeedList component
 * Tests loading state, empty state, article list, and load more
 */

import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { FeedList } from '../FeedList'
import type { ArticleCard } from '@/features/content/types'

// Mock the content API — both authenticated and public
const mockGetFeed = jest.fn()
// Both sources answer through mockGetFeed; these record which one was asked.
const mockPersonalFeed = jest.fn((...args: unknown[]) => mockGetFeed(...args))
const mockPublicFeed = jest.fn((...args: unknown[]) => mockGetFeed(...args))
jest.mock('@/features/content/api/contentApi', () => ({
    contentApi: {
        getFeed: (...args: unknown[]) => mockPersonalFeed(...args),
    },
    publicContentApi: {
        getFeed: (...args: unknown[]) => mockPublicFeed(...args),
    },
}))

// The session is the server's answer now, not a look in storage.
const mockUseSession = jest.fn(() => 'anonymous')
jest.mock('@/shared/hooks/useSession', () => ({
    useSession: () => mockUseSession(),
}))

// Mock sub-components to simplify testing
jest.mock('../CategoryFilter', () => ({
    CategoryFilter: ({ onSelect }: { onSelect: (category: string | null) => void }) => (
        <div data-testid="category-filter">
            <button onClick={() => onSelect('nutrition')}>Nutrition</button>
            <button onClick={() => onSelect(null)}>All</button>
        </div>
    ),
}))

jest.mock('../FeedCard', () => ({
    FeedCard: ({ article }: { article: ArticleCard }) => (
        <div data-testid={`feed-card-${article.id}`}>{article.title}</div>
    ),
}))

const createArticles = (count: number): ArticleCard[] =>
    Array.from({ length: count }, (_, i) => ({
        id: `article-${i + 1}`,
        author_name: 'Author',
        title: `Article ${i + 1}`,
        excerpt: `Excerpt ${i + 1}`,
        category: 'nutrition' as const,
        published_at: '2026-03-01T12:00:00Z',
    }))

describe('FeedList', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockUseSession.mockReturnValue('anonymous')
    })

    // The page fetches the first page on the server, so the links are in the
    // HTML a search engine reads. The browser must not throw that away.
    describe('with articles from the server', () => {
        const initial = createArticles(2)

        it('shows them at once, without a spinner or a second request', async () => {
            render(<FeedList initialArticles={initial} initialTotal={2} />)

            expect(screen.getByTestId('feed-card-article-1')).toBeInTheDocument()
            expect(document.querySelector('.animate-spin')).toBeFalsy()
            await new Promise((r) => setTimeout(r, 0))
            expect(mockPublicFeed).not.toHaveBeenCalled()
        })

        it('waits for the session without throwing the articles away', async () => {
            mockUseSession.mockReturnValue('restoring')
            render(<FeedList initialArticles={initial} initialTotal={2} />)

            await new Promise((r) => setTimeout(r, 0))
            expect(screen.getByTestId('feed-card-article-1')).toBeInTheDocument()
            expect(mockPublicFeed).not.toHaveBeenCalled()
        })

        it('asks for a category when one is chosen', async () => {
            mockGetFeed.mockResolvedValue({ articles: [], total: 0 })
            render(<FeedList initialArticles={initial} initialTotal={2} />)

            fireEvent.click(screen.getByText('Nutrition'))

            await waitFor(() =>
                expect(mockPublicFeed).toHaveBeenCalledWith('nutrition', expect.any(Number), 0),
            )
        })

        it('replaces them with the personal feed of a signed-in reader', async () => {
            mockUseSession.mockReturnValue('authenticated')
            mockGetFeed.mockResolvedValue({ articles: createArticles(3), total: 3 })
            render(<FeedList initialArticles={initial} initialTotal={2} />)

            await waitFor(() => expect(screen.getByTestId('feed-card-article-3')).toBeInTheDocument())
            expect(mockPersonalFeed).toHaveBeenCalled()
            expect(mockPublicFeed).not.toHaveBeenCalled()
        })

        it('offers more when the server says there are more', () => {
            render(<FeedList initialArticles={initial} initialTotal={25} />)

            expect(screen.getByText('Загрузить ещё')).toBeInTheDocument()
        })
    })

    it('shows loading spinner initially', () => {
        mockGetFeed.mockReturnValue(new Promise(() => {})) // never resolves
        render(<FeedList />)

        expect(document.querySelector('.animate-spin')).toBeTruthy()
    })

    it('renders articles after loading', async () => {
        const articles = createArticles(3)
        mockGetFeed.mockResolvedValue({ articles, total: 3 })

        render(<FeedList />)

        await waitFor(() => {
            expect(screen.getByText('Article 1')).toBeInTheDocument()
        })

        expect(screen.getByText('Article 2')).toBeInTheDocument()
        expect(screen.getByText('Article 3')).toBeInTheDocument()
    })

    it('shows empty state when no articles', async () => {
        mockGetFeed.mockResolvedValue({ articles: [], total: 0 })

        render(<FeedList />)

        await waitFor(() => {
            expect(screen.getByText('Пока нет контента')).toBeInTheDocument()
        })
    })

    it('shows "load more" button when there are more articles', async () => {
        const articles = createArticles(20)
        mockGetFeed.mockResolvedValue({ articles, total: 40 })

        render(<FeedList />)

        await waitFor(() => {
            expect(screen.getByText('Загрузить ещё')).toBeInTheDocument()
        })
    })

    it('does not show "load more" when all articles loaded', async () => {
        const articles = createArticles(3)
        mockGetFeed.mockResolvedValue({ articles, total: 3 })

        render(<FeedList />)

        await waitFor(() => {
            expect(screen.getByText('Article 1')).toBeInTheDocument()
        })

        expect(screen.queryByText('Загрузить ещё')).not.toBeInTheDocument()
    })

    it('loads more articles when button clicked', async () => {
        const firstBatch = createArticles(20)
        mockGetFeed.mockResolvedValueOnce({ articles: firstBatch, total: 25 })

        render(<FeedList />)

        await waitFor(() => {
            expect(screen.getByText('Загрузить ещё')).toBeInTheDocument()
        })

        const moreArticles = createArticles(5).map((a, i) => ({
            ...a,
            id: `article-more-${i}`,
            title: `More Article ${i + 1}`,
        }))
        mockGetFeed.mockResolvedValueOnce({ articles: moreArticles, total: 25 })

        fireEvent.click(screen.getByText('Загрузить ещё'))

        await waitFor(() => {
            expect(screen.getByText('More Article 1')).toBeInTheDocument()
        })
    })

    it('fetches with category filter when selected', async () => {
        mockGetFeed.mockResolvedValue({ articles: [], total: 0 })

        render(<FeedList />)

        await waitFor(() => {
            expect(screen.getByText('Пока нет контента')).toBeInTheDocument()
        })

        mockGetFeed.mockClear()
        mockGetFeed.mockResolvedValue({ articles: [], total: 0 })

        fireEvent.click(screen.getByText('Nutrition'))

        await waitFor(() => {
            expect(mockGetFeed).toHaveBeenCalledWith('nutrition', 20, 0)
        })
    })

    it('handles fetch error gracefully', async () => {
        mockGetFeed.mockRejectedValue(new Error('Network error'))

        render(<FeedList />)

        await waitFor(() => {
            expect(screen.getByText('Network error')).toBeInTheDocument()
        })
    })

    it('renders CategoryFilter component', async () => {
        mockGetFeed.mockResolvedValue({ articles: [], total: 0 })

        render(<FeedList />)

        expect(screen.getByTestId('category-filter')).toBeInTheDocument()
    })
})
