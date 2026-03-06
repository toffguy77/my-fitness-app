/**
 * Unit tests for notifications preferencesApi
 */

jest.mock('@/shared/utils/api-client', () => ({
    apiClient: {
        get: jest.fn(),
        put: jest.fn(),
    },
}))

import { apiClient } from '@/shared/utils/api-client'
import { getNotificationPreferences, updateNotificationPreferences } from '../preferencesApi'

const mockGet = apiClient.get as jest.Mock
const mockPut = apiClient.put as jest.Mock

describe('preferencesApi', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('getNotificationPreferences', () => {
        it('should GET from /backend-api/v1/notifications/preferences', async () => {
            const mockPrefs = { mutedCategories: ['nutrition'], muted: false }
            mockGet.mockResolvedValue(mockPrefs)

            const result = await getNotificationPreferences()

            expect(mockGet).toHaveBeenCalledWith('/backend-api/v1/notifications/preferences')
            expect(result).toEqual(mockPrefs)
        })

        it('should propagate errors', async () => {
            mockGet.mockRejectedValue(new Error('Unauthorized'))

            await expect(getNotificationPreferences()).rejects.toThrow('Unauthorized')
        })
    })

    describe('updateNotificationPreferences', () => {
        it('should PUT to /backend-api/v1/notifications/preferences', async () => {
            const req = { mutedCategories: ['training'], muted: true }
            mockPut.mockResolvedValue(undefined)

            await updateNotificationPreferences(req)

            expect(mockPut).toHaveBeenCalledWith('/backend-api/v1/notifications/preferences', req)
        })

        it('should handle empty categories', async () => {
            const req = { mutedCategories: [], muted: false }
            mockPut.mockResolvedValue(undefined)

            await updateNotificationPreferences(req)

            expect(mockPut).toHaveBeenCalledWith('/backend-api/v1/notifications/preferences', req)
        })

        it('should propagate errors', async () => {
            mockPut.mockRejectedValue(new Error('Server error'))

            await expect(
                updateNotificationPreferences({ mutedCategories: [], muted: false })
            ).rejects.toThrow('Server error')
        })
    })
})
