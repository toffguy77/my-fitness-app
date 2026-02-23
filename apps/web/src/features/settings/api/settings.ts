import { apiClient } from '@/shared/utils/api-client'

// Types
export interface FullProfile {
    id: number
    email: string
    name: string
    role: string
    avatar_url: string
    onboarding_completed: boolean
    settings: UserSettings
}

export interface UserSettings {
    language: string
    units: string
    telegram_username: string
    instagram_username: string
    apple_health_enabled: boolean
}

export async function getProfile(): Promise<FullProfile> {
    return apiClient.get<FullProfile>('/backend-api/v1/users/profile')
}

export async function updateProfile(data: { name: string }): Promise<FullProfile> {
    return apiClient.put<FullProfile>('/backend-api/v1/users/profile', data)
}

export async function updateSettings(settings: Partial<UserSettings>): Promise<{ settings: UserSettings }> {
    return apiClient.put('/backend-api/v1/users/settings', settings)
}

export async function uploadAvatar(file: File): Promise<string> {
    const formData = new FormData()
    formData.append('avatar', file)
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null
    const res = await fetch('/backend-api/v1/users/avatar', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
    })
    if (!res.ok) throw new Error('Upload failed')
    const data = await res.json()
    return data.data?.avatar_url || data.avatar_url
}

export async function deleteAvatar(): Promise<void> {
    await apiClient.delete('/backend-api/v1/users/avatar')
}
