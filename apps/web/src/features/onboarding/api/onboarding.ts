import { apiClient } from '@/shared/utils/api-client'

export async function completeOnboarding(): Promise<void> {
    await apiClient.put('/api/v1/users/onboarding/complete', {})
}
