/**
 * Unit tests for ArticleList component (curator/admin article management)
 */

import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { ArticleList } from '../ArticleList'
import type { Article } from '@/features/content/types'

// Mock the content API
jest.mock('@/features/content/api/contentApi', () => ({
    contentApi: {
        listArticles: jest.fn(),
        deleteArticle: jest.fn(),
        publishArticle: jest.fn(),
    },
}))

// Mock next/link
jest.mock('next/link', () => ({
    __esModule: true,
    default: ({ href, children, ...props }: any) => (
        <a href={href} {...props}>{children}</a>
    ),
}))

// Mock StatusBadge
jest.mock('../StatusBadge', () => ({
    StatusBadge: ({ status }: { status: string }) => (
        <span data-testid="status-badge">{status}</span>
    ),
}))

import { contentApi } from '@/features/content/api/contentApi'

const mockListArticles = contentApi.listArticles as jest.Mock
const mockDeleteArticle = contentApi.deleteArticle as jest.Mock
const mockPublishArticle = contentApi.publishArticle as jest.Mock

const createArticle = (overrides: Partial<Article> = {}): Article => ({
    id: '1',
    author_id: 1,
    author_name: 'Author',
    title: 'Test Article',
    excerpt: 'Test excerpt',
    category: 'nutrition',
    status: 'draft',
    audience_scope: 'all',
    is_own: true,
    created_at: '2026-03-01T00:00:00Z',
    updated_at: '2026-03-01T00:00:00Z',
    ...overrides,
})

describe('ArticleList', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        // @ts-ignore
        window.confirm = jest.fn(() => true)
    })

    it('shows loading spinner initially', () => {
        mockListArticles.mockReturnValue(new Promise(() => {}))
        render(<ArticleList />)
        expect(document.querySelector('.animate-spin')).toBeTruthy()
    })

    it('renders articles after loading', async () => {
        const articles = [createArticle({ id: '1', title: 'Article One' })]
        mockListArticles.mockResolvedValue({ articles, total: 1 })

        render(<ArticleList />)

        await waitFor(() => {
            expect(screen.getByText('Article One')).toBeInTheDocument()
        })
    })

    it('shows empty state when no articles', async () => {
        mockListArticles.mockResolvedValue({ articles: [], total: 0 })

        render(<ArticleList />)

        await waitFor(() => {
            expect(screen.getByText('Статей пока нет')).toBeInTheDocument()
        })
    })

    it('renders "create article" link with correct basePath', async () => {
        mockListArticles.mockResolvedValue({ articles: [], total: 0 })

        render(<ArticleList basePath="/admin/content" />)

        await waitFor(() => {
            const createLink = screen.getByText('Создать статью')
            expect(createLink.closest('a')).toHaveAttribute('href', '/admin/content/new')
        })
    })

    it('renders status filter tabs', async () => {
        mockListArticles.mockResolvedValue({ articles: [], total: 0 })

        render(<ArticleList />)

        expect(screen.getByText('Все')).toBeInTheDocument()
        expect(screen.getByText('Черновики')).toBeInTheDocument()
        expect(screen.getByText('Запланированные')).toBeInTheDocument()
        expect(screen.getByText('Опубликованные')).toBeInTheDocument()
    })

    it('filters by status when tab is clicked', async () => {
        mockListArticles.mockResolvedValue({ articles: [], total: 0 })

        render(<ArticleList />)

        await waitFor(() => {
            expect(screen.getByText('Статей пока нет')).toBeInTheDocument()
        })

        mockListArticles.mockClear()
        mockListArticles.mockResolvedValue({ articles: [], total: 0 })

        fireEvent.click(screen.getByText('Черновики'))

        await waitFor(() => {
            expect(mockListArticles).toHaveBeenCalledWith('draft', undefined)
        })
    })

    it('shows publish button for draft articles', async () => {
        const articles = [createArticle({ status: 'draft' })]
        mockListArticles.mockResolvedValue({ articles, total: 1 })

        render(<ArticleList />)

        await waitFor(() => {
            expect(screen.getByText('Опубликовать')).toBeInTheDocument()
        })
    })

    it('does not show publish button for published articles', async () => {
        const articles = [createArticle({ status: 'published' })]
        mockListArticles.mockResolvedValue({ articles, total: 1 })

        render(<ArticleList />)

        await waitFor(() => {
            expect(screen.getByText('Test Article')).toBeInTheDocument()
        })

        expect(screen.queryByText('Опубликовать')).not.toBeInTheDocument()
    })

    it('always shows author name', async () => {
        const articles = [createArticle({ author_name: 'John Doe' })]
        mockListArticles.mockResolvedValue({ articles, total: 1 })

        render(<ArticleList />)

        await waitFor(() => {
            expect(screen.getByText('John Doe')).toBeInTheDocument()
        })
    })

    it('hides action buttons for non-own articles', async () => {
        const articles = [createArticle({ is_own: false })]
        mockListArticles.mockResolvedValue({ articles, total: 1 })

        render(<ArticleList />)

        await waitFor(() => {
            expect(screen.getByText('Test Article')).toBeInTheDocument()
        })

        expect(screen.queryByText('Редактировать')).not.toBeInTheDocument()
        expect(screen.queryByText('Удалить')).not.toBeInTheDocument()
    })

    it('handles delete with confirmation', async () => {
        const articles = [createArticle()]
        mockListArticles.mockResolvedValue({ articles, total: 1 })
        mockDeleteArticle.mockResolvedValue(undefined)

        render(<ArticleList />)

        await waitFor(() => {
            expect(screen.getByText('Удалить')).toBeInTheDocument()
        })

        fireEvent.click(screen.getByText('Удалить'))

        expect(window.confirm).toHaveBeenCalledWith('Удалить статью?')
        expect(mockDeleteArticle).toHaveBeenCalledWith('1')
    })

    it('renders edit link with correct path', async () => {
        const articles = [createArticle({ id: 'abc-123' })]
        mockListArticles.mockResolvedValue({ articles, total: 1 })

        render(<ArticleList basePath="/curator/content" />)

        await waitFor(() => {
            const editLink = screen.getByText('Редактировать')
            expect(editLink.closest('a')).toHaveAttribute('href', '/curator/content/abc-123/edit')
        })
    })

    it('handles listArticles error gracefully', async () => {
        mockListArticles.mockRejectedValue(new Error('API error'))

        render(<ArticleList />)

        await waitFor(() => {
            expect(screen.getByText('Статей пока нет')).toBeInTheDocument()
        })
    })
})
