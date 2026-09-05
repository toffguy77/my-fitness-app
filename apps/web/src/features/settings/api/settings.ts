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
    timezone: string
    telegram_username: string
    instagram_username: string
    apple_health_enabled: boolean
    target_weight?: number | null
    height?: number | null
    birth_date?: string | null
    biological_sex?: string | null
    activity_level?: string | null
    fitness_goal?: string | null
}

export async function getProfile(): Promise<FullProfile> {
    const res = await apiClient.get<{ profile: FullProfile }>('/api/v1/users/profile')
    return res.profile
}

export async function updateProfile(data: { name: string }): Promise<FullProfile> {
    const res = await apiClient.put<{ profile: FullProfile }>('/api/v1/users/profile', data)
    return res.profile
}

export async function updateSettings(settings: Partial<UserSettings>): Promise<{ settings: UserSettings }> {
    return apiClient.put('/api/v1/users/settings', settings)
}

export async function uploadAvatar(file: File): Promise<string> {
    const formData = new FormData()
    formData.append('avatar', file)
    const result = await apiClient.postFormData<{ avatar_url: string }>('/api/v1/users/avatar', formData)
    return result.avatar_url
}

export async function deleteAvatar(): Promise<void> {
    await apiClient.delete('/api/v1/users/avatar')
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
    // Changing a password ends every session, including this one — a stolen
    // refresh token must not survive the very action taken to stop it. The
    // response carries a replacement pair for the device that asked, and
    // installing it is what keeps that person signed in.
    //
    // Without this the access token in memory is a version behind: every
    // request after the change costs a 401 and a refresh, and several of them
    // at once race until one loses and the app decides nobody is signed in.
    const replacement = await apiClient.post<{ token?: string }>(
        '/api/v1/auth/change-password',
        { current_password: currentPassword, new_password: newPassword }
    )

    if (replacement?.token) {
        apiClient.setToken(replacement.token)
    }
}
