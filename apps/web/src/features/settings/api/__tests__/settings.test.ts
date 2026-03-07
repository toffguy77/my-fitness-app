import { getProfile, updateProfile, updateSettings, uploadAvatar, deleteAvatar } from '../settings'

jest.mock('@/shared/utils/api-client', () => ({
  apiClient: {
    get: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}))

import { apiClient } from '@/shared/utils/api-client'

const mockApiClient = apiClient as jest.Mocked<typeof apiClient>

describe('Settings API', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('getProfile', () => {
    it('fetches profile from /backend-api/v1/users/profile', async () => {
      const profile = { id: 1, email: 'test@example.com', name: 'Test' }
      mockApiClient.get.mockResolvedValueOnce({ profile })

      const result = await getProfile()

      expect(mockApiClient.get).toHaveBeenCalledWith('/backend-api/v1/users/profile')
      expect(result).toEqual(profile)
    })
  })

  describe('updateProfile', () => {
    it('puts name update to /backend-api/v1/users/profile', async () => {
      const profile = { id: 1, email: 'test@example.com', name: 'Updated' }
      mockApiClient.put.mockResolvedValueOnce({ profile })

      const result = await updateProfile({ name: 'Updated' })

      expect(mockApiClient.put).toHaveBeenCalledWith('/backend-api/v1/users/profile', { name: 'Updated' })
      expect(result).toEqual(profile)
    })
  })

  describe('updateSettings', () => {
    it('puts settings to /backend-api/v1/users/settings', async () => {
      const response = { settings: { language: 'en' } }
      mockApiClient.put.mockResolvedValueOnce(response)

      const result = await updateSettings({ language: 'en' })

      expect(mockApiClient.put).toHaveBeenCalledWith('/backend-api/v1/users/settings', { language: 'en' })
      expect(result).toEqual(response)
    })
  })

  describe('uploadAvatar', () => {
    const originalFetch = global.fetch

    beforeEach(() => {
      Object.defineProperty(global, 'localStorage', {
        value: {
          getItem: jest.fn().mockReturnValue('test-token'),
          setItem: jest.fn(),
          removeItem: jest.fn(),
        },
        writable: true,
      })
    })

    afterEach(() => {
      global.fetch = originalFetch
    })

    it('uploads file via POST with FormData and auth token', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValueOnce({ data: { avatar_url: 'https://example.com/avatar.jpg' } }),
      }
      global.fetch = jest.fn().mockResolvedValueOnce(mockResponse)

      const file = new File(['img'], 'avatar.png', { type: 'image/png' })
      const result = await uploadAvatar(file)

      expect(global.fetch).toHaveBeenCalledWith('/backend-api/v1/users/avatar', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-token' },
        body: expect.any(FormData),
      })
      expect(result).toBe('https://example.com/avatar.jpg')
    })

    it('falls back to avatar_url at top level if data.avatar_url missing', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValueOnce({ avatar_url: 'https://example.com/fallback.jpg' }),
      }
      global.fetch = jest.fn().mockResolvedValueOnce(mockResponse)

      const file = new File(['img'], 'avatar.png', { type: 'image/png' })
      const result = await uploadAvatar(file)

      expect(result).toBe('https://example.com/fallback.jpg')
    })

    it('throws if response is not ok', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({ ok: false })

      const file = new File(['img'], 'avatar.png', { type: 'image/png' })

      await expect(uploadAvatar(file)).rejects.toThrow('Upload failed')
    })

    it('sends no auth header when token is absent', async () => {
      ;(localStorage.getItem as jest.Mock).mockReturnValueOnce(null)

      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValueOnce({ avatar_url: 'url' }),
      }
      global.fetch = jest.fn().mockResolvedValueOnce(mockResponse)

      const file = new File(['img'], 'avatar.png', { type: 'image/png' })
      await uploadAvatar(file)

      expect(global.fetch).toHaveBeenCalledWith('/backend-api/v1/users/avatar', {
        method: 'POST',
        headers: {},
        body: expect.any(FormData),
      })
    })
  })

  describe('deleteAvatar', () => {
    it('sends DELETE to /backend-api/v1/users/avatar', async () => {
      mockApiClient.delete.mockResolvedValueOnce(undefined)

      await deleteAvatar()

      expect(mockApiClient.delete).toHaveBeenCalledWith('/backend-api/v1/users/avatar')
    })
  })
})
