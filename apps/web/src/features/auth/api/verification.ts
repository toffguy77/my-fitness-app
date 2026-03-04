import { apiClient } from '@/shared/utils/api-client';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

export async function verifyEmail(code: string): Promise<void> {
    await apiClient.post(`${API_BASE}/backend-api/v1/auth/verify-email`, { code });
}

export async function resendVerificationCode(): Promise<void> {
    await apiClient.post(`${API_BASE}/backend-api/v1/auth/resend-verification`, {});
}
