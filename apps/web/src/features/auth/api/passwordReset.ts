/**
 * Password Reset API Client
 * Handles password reset and recovery operations
 */

import { apiClient } from '@/shared/utils/api-client'

export interface RequestPasswordResetParams {
    email: string
}

export interface RequestPasswordResetResponse {
    message: string
}

export interface ResetPasswordParams {
    token: string
    password: string
}

export interface ResetPasswordResponse {
    success: boolean
    message: string
}

export interface ValidateTokenResponse {
    valid: boolean
    expires_at: string
}

/**
 * Request a password reset email
 * @param email - User's email address
 * @returns Promise with success message
 */
export async function requestPasswordReset(
    email: string
): Promise<RequestPasswordResetResponse> {
    return apiClient.post<RequestPasswordResetResponse>(
        '/api/v1/auth/forgot-password',
        { email }
    )
}

/**
 * Reset password using a valid token
 * @param token - Reset token from email
 * @param password - New password
 * @returns Promise with success status
 */
export async function resetPassword(
    token: string,
    password: string
): Promise<ResetPasswordResponse> {
    return apiClient.post<ResetPasswordResponse>(
        '/api/v1/auth/reset-password',
        { token, password }
    )
}

/**
 * Validate a reset token
 * @param token - Reset token to validate
 * @returns Promise with validation result
 */
export async function validateResetToken(token: string): Promise<ValidateTokenResponse> {
    return apiClient.get<ValidateTokenResponse>(
        `/api/v1/auth/validate-reset-token?token=${encodeURIComponent(token)}`
    )
}
