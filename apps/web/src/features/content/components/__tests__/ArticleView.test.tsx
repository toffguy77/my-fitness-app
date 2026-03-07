/**
 * Unit tests for ArticleView component
 * Tests loading, error, and success states
 */

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { ArticleView } from '../ArticleView'

// Mock the content API
jest.mock('@/features/content/api/contentApi', () => ({
    contentApi: {
        getFeedArticle: jest.fn(),
    },
    publicContentApi: {
        getArticle: jest.fn(),
    },
}))

// Mock next/link
jest.mock('next/link', () => ({
    __esModule: true,
    default: ({ href, children, ...props }: any) => (
        <a href={href} {...props}>{children}</a>
    ),
}))

// Mock react-markdown
jest.mock('react-markdown', () => ({
    __esModule: true,
    default: ({ children }: { children: string }) => <div data-testid="markdown">{children}</div>,
}))

// Mock remark-gfm
jest.mock('remark-gfm', () => ({
    __esModule: true,
    default: jest.fn(),
}))

// Mock lucide-react
jest.mock('lucide-react', () => ({
    ArrowLeft: () => <span data-testid="arrow-left" />,
}))

import { contentApi, publicContentApi } from '@/features/content/api/contentApi'

const mockGetFeedArticle = contentApi.getFeedArticle as jest.Mock
const mockGetPublicArticle = publicContentApi.getArticle as jest.Mock

describe('ArticleView', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('shows loading spinner initially', () => {
        mockGetFeedArticle.mockReturnValue(new Promise(() => {})) // never resolves
        const { container } = render(<ArticleView articleId="1" />)

        expect(container.querySelector('.animate-spin')).toBeTruthy()
    })

    it('renders article content when loaded', async () => {
        const article = {
            id: '1',
            title: 'Test Article',
            body: '# Hello World',
            category: 'nutrition' as const,
            author_name: 'Author Name',
            published_at: '2026-03-01T12:00:00Z',
            status: 'published',
            created_at: '2026-03-01T10:00:00Z',
            updated_at: '2026-03-01T12:00:00Z',
        }
        mockGetFeedArticle.mockResolvedValue(article)

        render(<ArticleView articleId="1" />)

        await waitFor(() => {
            expect(screen.getByText('Test Article')).toBeInTheDocument()
        })

        expect(screen.getByText(/Author Name/)).toBeInTheDocument()
        expect(screen.getByText('# Hello World')).toBeInTheDocument()
    })

    it('renders error state when both fetches fail', async () => {
        mockGetFeedArticle.mockRejectedValue(new Error('Network error'))
        mockGetPublicArticle.mockRejectedValue(new Error('Network error'))

        render(<ArticleView articleId="1" />)

        await waitFor(() => {
            expect(screen.getByText('Network error')).toBeInTheDocument()
        })

        // Should show back link
        expect(screen.getByText('Назад')).toBeInTheDocument()
    })

    it('falls back to public API when authenticated fetch fails', async () => {
        const article = {
            id: '1',
            title: 'Public Article',
            body: 'Public body',
            category: 'general' as const,
            author_name: 'Author',
            published_at: '2026-01-01T00:00:00Z',
            status: 'published',
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
        }
        mockGetFeedArticle.mockRejectedValue(new Error('Unauthorized'))
        mockGetPublicArticle.mockResolvedValue(article)

        render(<ArticleView articleId="1" />)

        await waitFor(() => {
            expect(screen.getByText('Public Article')).toBeInTheDocument()
        })
    })

    it('renders not found when article is null', async () => {
        mockGetFeedArticle.mockRejectedValue(new Error('Не удалось загрузить статью'))
        mockGetPublicArticle.mockRejectedValue(new Error('Не удалось загрузить статью'))

        render(<ArticleView articleId="nonexistent" />)

        await waitFor(() => {
            expect(screen.getByText(/Не удалось загрузить статью/)).toBeInTheDocument()
        })
    })

    it('renders back link to /content', async () => {
        const article = {
            id: '1',
            title: 'Test',
            body: 'Body',
            category: 'general' as const,
            author_name: 'Author',
            published_at: '2026-01-01T00:00:00Z',
            status: 'published',
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
        }
        mockGetFeedArticle.mockResolvedValue(article)

        render(<ArticleView articleId="1" />)

        await waitFor(() => {
            expect(screen.getByText('Test')).toBeInTheDocument()
        })

        const backLink = screen.getByText('Назад')
        expect(backLink.closest('a')).toHaveAttribute('href', '/content')
    })

    it('shows category label', async () => {
        const article = {
            id: '1',
            title: 'Training Article',
            body: 'Body',
            category: 'training' as const,
            author_name: 'Author',
            status: 'published',
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
        }
        mockGetFeedArticle.mockResolvedValue(article)

        render(<ArticleView articleId="1" />)

        await waitFor(() => {
            expect(screen.getByText('Тренировки')).toBeInTheDocument()
        })
    })

    it('handles non-Error exceptions gracefully', async () => {
        mockGetFeedArticle.mockRejectedValue('string error')
        mockGetPublicArticle.mockRejectedValue('string error')

        render(<ArticleView articleId="1" />)

        await waitFor(() => {
            expect(screen.getByText('Не удалось загрузить статью')).toBeInTheDocument()
        })
    })
})
