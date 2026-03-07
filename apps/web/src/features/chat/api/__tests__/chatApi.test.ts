import { chatApi } from '../chatApi'
import { apiClient } from '@/shared/utils/api-client'

jest.mock('@/shared/utils/api-client', () => ({
    apiClient: {
        get: jest.fn(),
        post: jest.fn(),
    },
}))

const mockApiClient = apiClient as jest.Mocked<typeof apiClient>

describe('chatApi', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('getConversations', () => {
        it('calls apiClient.get with correct URL', async () => {
            const convs = [{ id: 'conv-1' }]
            mockApiClient.get.mockResolvedValue(convs)

            const result = await chatApi.getConversations()

            expect(mockApiClient.get).toHaveBeenCalledWith('/backend-api/v1/conversations')
            expect(result).toEqual(convs)
        })
    })

    describe('getMessages', () => {
        it('fetches messages without cursor', async () => {
            const msgs = [{ id: 'msg-1' }]
            mockApiClient.get.mockResolvedValue(msgs)

            const result = await chatApi.getMessages('conv-1')

            expect(mockApiClient.get).toHaveBeenCalledWith(
                '/backend-api/v1/conversations/conv-1/messages?limit=50'
            )
            expect(result).toEqual(msgs)
        })

        it('fetches messages with cursor and custom limit', async () => {
            mockApiClient.get.mockResolvedValue([])

            await chatApi.getMessages('conv-1', 'cursor-abc', 25)

            expect(mockApiClient.get).toHaveBeenCalledWith(
                '/backend-api/v1/conversations/conv-1/messages?limit=25&cursor=cursor-abc'
            )
        })

        it('fetches messages with cursor and default limit', async () => {
            mockApiClient.get.mockResolvedValue([])

            await chatApi.getMessages('conv-1', 'cursor-abc')

            expect(mockApiClient.get).toHaveBeenCalledWith(
                '/backend-api/v1/conversations/conv-1/messages?limit=50&cursor=cursor-abc'
            )
        })
    })

    describe('sendMessage', () => {
        it('posts message data to correct URL', async () => {
            const msg = { id: 'msg-1', type: 'text', content: 'hello' }
            mockApiClient.post.mockResolvedValue(msg)

            const result = await chatApi.sendMessage('conv-1', {
                type: 'text',
                content: 'hello',
            })

            expect(mockApiClient.post).toHaveBeenCalledWith(
                '/backend-api/v1/conversations/conv-1/messages',
                { type: 'text', content: 'hello' }
            )
            expect(result).toEqual(msg)
        })
    })

    describe('uploadFile', () => {
        const originalFetch = global.fetch

        afterEach(() => {
            global.fetch = originalFetch
            localStorage.clear()
        })

        it('uploads file with FormData and auth token', async () => {
            localStorage.setItem('auth_token', 'test-token')
            const mockResponse = {
                ok: true,
                json: jest.fn().mockResolvedValue({ data: { id: 'att-1', file_url: '/file.png' } }),
            }
            global.fetch = jest.fn().mockResolvedValue(mockResponse)

            const file = new File(['content'], 'test.png', { type: 'image/png' })
            const result = await chatApi.uploadFile('conv-1', file)

            expect(global.fetch).toHaveBeenCalledWith(
                '/backend-api/v1/conversations/conv-1/upload',
                expect.objectContaining({
                    method: 'POST',
                    headers: { Authorization: 'Bearer test-token' },
                })
            )
            expect(result).toEqual({ id: 'att-1', file_url: '/file.png' })
        })

        it('uploads file without auth token', async () => {
            const mockResponse = {
                ok: true,
                json: jest.fn().mockResolvedValue({ id: 'att-1' }),
            }
            global.fetch = jest.fn().mockResolvedValue(mockResponse)

            const file = new File(['content'], 'test.txt', { type: 'text/plain' })
            const result = await chatApi.uploadFile('conv-1', file)

            expect(global.fetch).toHaveBeenCalledWith(
                '/backend-api/v1/conversations/conv-1/upload',
                expect.objectContaining({
                    method: 'POST',
                    headers: {},
                })
            )
            // Falls back to json root when data is absent
            expect(result).toEqual({ id: 'att-1' })
        })

        it('throws on non-ok response', async () => {
            global.fetch = jest.fn().mockResolvedValue({ ok: false })

            const file = new File(['content'], 'test.txt', { type: 'text/plain' })
            await expect(chatApi.uploadFile('conv-1', file)).rejects.toThrow('Upload failed')
        })
    })

    describe('markAsRead', () => {
        it('posts to correct URL', async () => {
            mockApiClient.post.mockResolvedValue(undefined)

            await chatApi.markAsRead('conv-1')

            expect(mockApiClient.post).toHaveBeenCalledWith(
                '/backend-api/v1/conversations/conv-1/read',
                {}
            )
        })
    })

    describe('getUnreadCount', () => {
        it('fetches unread count', async () => {
            mockApiClient.get.mockResolvedValue({ count: 5 })

            const result = await chatApi.getUnreadCount()

            expect(mockApiClient.get).toHaveBeenCalledWith('/backend-api/v1/conversations/unread')
            expect(result).toEqual({ count: 5 })
        })
    })

    describe('createFoodEntry', () => {
        it('posts food entry data to correct URL', async () => {
            const entry = { id: 'msg-2', type: 'food_entry' }
            mockApiClient.post.mockResolvedValue(entry)

            const data = {
                food_name: 'Chicken',
                meal_type: 'lunch' as const,
                weight: 200,
                calories: 330,
                protein: 31,
                fat: 7,
                carbs: 0,
            }

            const result = await chatApi.createFoodEntry('conv-1', 'msg-1', data)

            expect(mockApiClient.post).toHaveBeenCalledWith(
                '/backend-api/v1/conversations/conv-1/messages/msg-1/food-entry',
                data
            )
            expect(result).toEqual(entry)
        })
    })
})
