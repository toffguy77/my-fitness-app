import { getProfile, updateProfile, updateSettings, uploadAvatar, deleteAvatar, changePassword } from '../settings'

jest.mock('@/shared/utils/api-client', () => ({
  apiClient: {
    get: jest.fn(),
    put: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
    postFormData: jest.fn(),
    setToken: jest.fn(),
  },
}))

import { apiClient } from '@/shared/utils/api-client'

const mockApiClient = apiClient as jest.Mocked<typeof apiClient>

describe('Settings API', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('getProfile', () => {
    it('fetches profile from /api/v1/users/profile', async () => {
      const profile = { id: 1, email: 'test@example.com', name: 'Test' }
      mockApiClient.get.mockResolvedValueOnce({ profile })

      const result = await getProfile()

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/v1/users/profile')
      expect(result).toEqual(profile)
    })
  })

  describe('updateProfile', () => {
    it('puts name update to /api/v1/users/profile', async () => {
      const profile = { id: 1, email: 'test@example.com', name: 'Updated' }
      mockApiClient.put.mockResolvedValueOnce({ profile })

      const result = await updateProfile({ name: 'Updated' })

      expect(mockApiClient.put).toHaveBeenCalledWith('/api/v1/users/profile', { name: 'Updated' })
      expect(result).toEqual(profile)
    })
  })

  describe('updateSettings', () => {
    it('puts settings to /api/v1/users/settings', async () => {
      const response = { settings: { language: 'en' } }
      mockApiClient.put.mockResolvedValueOnce(response)

      const result = await updateSettings({ language: 'en' })

      expect(mockApiClient.put).toHaveBeenCalledWith('/api/v1/users/settings', { language: 'en' })
      expect(result).toEqual(response)
    })
  })

  describe('uploadAvatar', () => {
    it('uploads file via postFormData and returns avatar_url', async () => {
      mockApiClient.postFormData.mockResolvedValueOnce({ avatar_url: 'https://example.com/avatar.jpg' })

      const file = new File(['img'], 'avatar.png', { type: 'image/png' })
      const result = await uploadAvatar(file)

      expect(mockApiClient.postFormData).toHaveBeenCalledWith(
        '/api/v1/users/avatar',
        expect.any(FormData)
      )
      expect(result).toBe('https://example.com/avatar.jpg')
    })

    it('appends file as avatar field in FormData', async () => {
      mockApiClient.postFormData.mockResolvedValueOnce({ avatar_url: 'https://example.com/avatar.jpg' })

      const file = new File(['img'], 'avatar.png', { type: 'image/png' })
      await uploadAvatar(file)

      const formData = (mockApiClient.postFormData as jest.Mock).mock.calls[0][1] as FormData
      expect(formData.get('avatar')).toBe(file)
    })

    it('throws if postFormData rejects', async () => {
      mockApiClient.postFormData.mockRejectedValueOnce(new Error('Upload failed'))

      const file = new File(['img'], 'avatar.png', { type: 'image/png' })

      await expect(uploadAvatar(file)).rejects.toThrow('Upload failed')
    })
  })

  describe('deleteAvatar', () => {
    it('sends DELETE to /api/v1/users/avatar', async () => {
      mockApiClient.delete.mockResolvedValueOnce(undefined)

      await deleteAvatar()

      expect(mockApiClient.delete).toHaveBeenCalledWith('/api/v1/users/avatar')
    })
  })
})

describe('changing a password', () => {
    it('installs the replacement token the server hands back', async () => {
        // The change ends every session, including this one. Without taking
        // the replacement, the token in memory is a version behind: every
        // request afterwards costs a 401 and a refresh, and several at once
        // race until one loses and the app decides nobody is signed in.
        mockApiClient.post.mockResolvedValue({ token: 'a-fresh-token', refresh_token: 'r' })

        await changePassword('0ld!Passw0rd', 'New!Passw0rd')

        expect(mockApiClient.post).toHaveBeenCalledWith('/api/v1/auth/change-password', {
            current_password: '0ld!Passw0rd',
            new_password: 'New!Passw0rd',
        })
        expect(mockApiClient.setToken).toHaveBeenCalledWith('a-fresh-token')
    })

    it('does not fall over when the response carries no replacement', async () => {
        // An older server, or a deployment mid-rollout.
        mockApiClient.post.mockResolvedValue(undefined)
        mockApiClient.setToken.mockClear()

        await expect(changePassword('a', 'b')).resolves.toBeUndefined()
        expect(mockApiClient.setToken).not.toHaveBeenCalled()
    })
})
