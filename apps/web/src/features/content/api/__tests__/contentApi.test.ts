/**
 * Unit tests for contentApi and publicContentApi
 * Tests all API methods for content management and public feed
 */

import { contentApi, publicContentApi } from '../contentApi'

// Mock the api-client
jest.mock('@/shared/utils/api-client', () => ({
    apiClient: {
        get: jest.fn(),
        post: jest.fn(),
        put: jest.fn(),
        delete: jest.fn(),
    },
}))

import { apiClient } from '@/shared/utils/api-client'

const mockGet = apiClient.get as jest.Mock
const mockPost = apiClient.post as jest.Mock
const mockPut = apiClient.put as jest.Mock
const mockDelete = apiClient.delete as jest.Mock

describe('contentApi', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('createArticle', () => {
        it('should POST to /api/v1/content/articles', async () => {
            const req = { title: 'Test', category: 'nutrition' as const, audience_scope: 'all' as const }
            const mockArticle = { id: '1', ...req }
            mockPost.mockResolvedValue(mockArticle)

            const result = await contentApi.createArticle(req)

            expect(mockPost).toHaveBeenCalledWith('/api/v1/content/articles', req)
            expect(result).toEqual(mockArticle)
        })
    })

    describe('getArticle', () => {
        it('should GET article by id', async () => {
            const mockArticle = { id: 'abc', title: 'Test' }
            mockGet.mockResolvedValue(mockArticle)

            const result = await contentApi.getArticle('abc')

            expect(mockGet).toHaveBeenCalledWith('/api/v1/content/articles/abc')
            expect(result).toEqual(mockArticle)
        })
    })

    describe('listArticles', () => {
        it('should GET articles without filters', async () => {
            const mockResponse = { articles: [], total: 0 }
            mockGet.mockResolvedValue(mockResponse)

            const result = await contentApi.listArticles()

            expect(mockGet).toHaveBeenCalledWith('/api/v1/content/articles')
            expect(result).toEqual(mockResponse)
        })

        it('should GET articles with status filter', async () => {
            mockGet.mockResolvedValue({ articles: [], total: 0 })

            await contentApi.listArticles('draft')

            expect(mockGet).toHaveBeenCalledWith('/api/v1/content/articles?status=draft')
        })

        it('should GET articles with category filter', async () => {
            mockGet.mockResolvedValue({ articles: [], total: 0 })

            await contentApi.listArticles(undefined, 'nutrition')

            expect(mockGet).toHaveBeenCalledWith('/api/v1/content/articles?category=nutrition')
        })

        it('should GET articles with both filters', async () => {
            mockGet.mockResolvedValue({ articles: [], total: 0 })

            await contentApi.listArticles('published', 'training')

            expect(mockGet).toHaveBeenCalledWith(
                '/api/v1/content/articles?status=published&category=training'
            )
        })
    })

    describe('updateArticle', () => {
        it('should PUT article by id', async () => {
            const updates = { title: 'Updated Title' }
            const mockArticle = { id: '1', title: 'Updated Title' }
            mockPut.mockResolvedValue(mockArticle)

            const result = await contentApi.updateArticle('1', updates)

            expect(mockPut).toHaveBeenCalledWith('/api/v1/content/articles/1', updates)
            expect(result).toEqual(mockArticle)
        })
    })

    describe('deleteArticle', () => {
        it('should DELETE article by id', async () => {
            mockDelete.mockResolvedValue(undefined)

            await contentApi.deleteArticle('1')

            expect(mockDelete).toHaveBeenCalledWith('/api/v1/content/articles/1')
        })
    })

    describe('publishArticle', () => {
        it('should POST to publish endpoint', async () => {
            mockPost.mockResolvedValue(undefined)

            await contentApi.publishArticle('1')

            expect(mockPost).toHaveBeenCalledWith('/api/v1/content/articles/1/publish', {})
        })
    })

    describe('scheduleArticle', () => {
        it('should POST schedule with scheduled_at', async () => {
            const req = { scheduled_at: '2026-04-01T12:00:00Z' }
            mockPost.mockResolvedValue(undefined)

            await contentApi.scheduleArticle('1', req)

            expect(mockPost).toHaveBeenCalledWith('/api/v1/content/articles/1/schedule', req)
        })
    })

    describe('unpublishArticle', () => {
        it('should POST to unpublish endpoint', async () => {
            mockPost.mockResolvedValue(undefined)

            await contentApi.unpublishArticle('1')

            expect(mockPost).toHaveBeenCalledWith('/api/v1/content/articles/1/unpublish', {})
        })
    })

    describe('getFeed', () => {
        it('should GET feed with default params', async () => {
            const mockResponse = { articles: [], total: 0 }
            mockGet.mockResolvedValue(mockResponse)

            const result = await contentApi.getFeed()

            expect(mockGet).toHaveBeenCalledWith(
                expect.stringContaining('/api/v1/content/feed?')
            )
            const url = mockGet.mock.calls[0][0]
            expect(url).toContain('limit=20')
            expect(url).toContain('offset=0')
            expect(result).toEqual(mockResponse)
        })

        it('should GET feed with category', async () => {
            mockGet.mockResolvedValue({ articles: [], total: 0 })

            await contentApi.getFeed('nutrition')

            const url = mockGet.mock.calls[0][0]
            expect(url).toContain('category=nutrition')
        })

        it('should GET feed with custom limit and offset', async () => {
            mockGet.mockResolvedValue({ articles: [], total: 0 })

            await contentApi.getFeed(undefined, 10, 5)

            const url = mockGet.mock.calls[0][0]
            expect(url).toContain('limit=10')
            expect(url).toContain('offset=5')
        })
    })

    describe('getFeedArticle', () => {
        it('should GET feed article by id', async () => {
            const mockArticle = { id: '1', title: 'Test' }
            mockGet.mockResolvedValue(mockArticle)

            const result = await contentApi.getFeedArticle('1')

            expect(mockGet).toHaveBeenCalledWith('/api/v1/content/feed/1')
            expect(result).toEqual(mockArticle)
        })
    })
})

describe('publicContentApi', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('getFeed', () => {
        it('should GET public feed with default params', async () => {
            const mockResponse = { articles: [], total: 0 }
            mockGet.mockResolvedValue(mockResponse)

            const result = await publicContentApi.getFeed()

            const url = mockGet.mock.calls[0][0]
            expect(url).toContain('/api/v1/public/content?')
            expect(url).toContain('limit=20')
            expect(url).toContain('offset=0')
            expect(result).toEqual(mockResponse)
        })

        it('should GET public feed with category filter', async () => {
            mockGet.mockResolvedValue({ articles: [], total: 0 })

            await publicContentApi.getFeed('health')

            const url = mockGet.mock.calls[0][0]
            expect(url).toContain('category=health')
        })

        it('should GET public feed with custom limit and offset', async () => {
            mockGet.mockResolvedValue({ articles: [], total: 0 })

            await publicContentApi.getFeed(undefined, 5, 10)

            const url = mockGet.mock.calls[0][0]
            expect(url).toContain('limit=5')
            expect(url).toContain('offset=10')
        })
    })

    describe('getArticle', () => {
        it('should GET public article by id', async () => {
            const mockArticle = { id: '1', title: 'Public Test' }
            mockGet.mockResolvedValue(mockArticle)

            const result = await publicContentApi.getArticle('1')

            expect(mockGet).toHaveBeenCalledWith('/api/v1/public/content/1')
            expect(result).toEqual(mockArticle)
        })
    })
})
