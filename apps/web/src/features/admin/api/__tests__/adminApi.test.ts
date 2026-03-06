import { adminApi } from '../adminApi'
import { apiClient } from '@/shared/utils/api-client'

jest.mock('@/shared/utils/api-client', () => ({
    apiClient: {
        get: jest.fn(),
        post: jest.fn(),
    },
}))

const mockApiClient = apiClient as jest.Mocked<typeof apiClient>

describe('adminApi', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('getUsers', () => {
        it('calls GET /backend-api/v1/admin/users', async () => {
            const users = [{ id: 1, name: 'Test User' }]
            mockApiClient.get.mockResolvedValue(users)

            const result = await adminApi.getUsers()

            expect(mockApiClient.get).toHaveBeenCalledWith('/backend-api/v1/admin/users')
            expect(result).toEqual(users)
        })
    })

    describe('getCurators', () => {
        it('calls GET /backend-api/v1/admin/curators', async () => {
            const curators = [{ id: 1, name: 'Curator', client_count: 5 }]
            mockApiClient.get.mockResolvedValue(curators)

            const result = await adminApi.getCurators()

            expect(mockApiClient.get).toHaveBeenCalledWith('/backend-api/v1/admin/curators')
            expect(result).toEqual(curators)
        })
    })

    describe('changeRole', () => {
        it('calls POST with userId and role', async () => {
            mockApiClient.post.mockResolvedValue(undefined)

            await adminApi.changeRole(42, 'coordinator')

            expect(mockApiClient.post).toHaveBeenCalledWith(
                '/backend-api/v1/admin/users/42/role',
                { role: 'coordinator' }
            )
        })
    })

    describe('assignCurator', () => {
        it('calls POST with client_id and curator_id', async () => {
            mockApiClient.post.mockResolvedValue(undefined)

            await adminApi.assignCurator(10, 20)

            expect(mockApiClient.post).toHaveBeenCalledWith(
                '/backend-api/v1/admin/assignments',
                { client_id: 10, curator_id: 20 }
            )
        })
    })

    describe('getConversations', () => {
        it('calls GET /backend-api/v1/admin/conversations', async () => {
            const convs = [{ id: 'conv-1' }]
            mockApiClient.get.mockResolvedValue(convs)

            const result = await adminApi.getConversations()

            expect(mockApiClient.get).toHaveBeenCalledWith('/backend-api/v1/admin/conversations')
            expect(result).toEqual(convs)
        })
    })

    describe('getConversationMessages', () => {
        it('fetches messages without cursor or limit', async () => {
            const msgs = [{ id: 'msg-1' }]
            mockApiClient.get.mockResolvedValue(msgs)

            const result = await adminApi.getConversationMessages('conv-1')

            expect(mockApiClient.get).toHaveBeenCalledWith(
                '/backend-api/v1/admin/conversations/conv-1/messages'
            )
            expect(result).toEqual(msgs)
        })

        it('builds URL with cursor param', async () => {
            mockApiClient.get.mockResolvedValue([])

            await adminApi.getConversationMessages('conv-1', 'cursor-abc')

            expect(mockApiClient.get).toHaveBeenCalledWith(
                '/backend-api/v1/admin/conversations/conv-1/messages?cursor=cursor-abc'
            )
        })

        it('builds URL with cursor and limit params', async () => {
            mockApiClient.get.mockResolvedValue([])

            await adminApi.getConversationMessages('conv-1', 'cursor-abc', 25)

            expect(mockApiClient.get).toHaveBeenCalledWith(
                '/backend-api/v1/admin/conversations/conv-1/messages?cursor=cursor-abc&limit=25'
            )
        })

        it('builds URL with limit only', async () => {
            mockApiClient.get.mockResolvedValue([])

            await adminApi.getConversationMessages('conv-1', undefined, 10)

            expect(mockApiClient.get).toHaveBeenCalledWith(
                '/backend-api/v1/admin/conversations/conv-1/messages?limit=10'
            )
        })
    })
})
