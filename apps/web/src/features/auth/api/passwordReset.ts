/**
 * Password Reset API Client
 * Handles password reset and recovery operations
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'

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
    const response = await fetch(`${API_URL}/api/v1/auth/forgot-password`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
    })

    const data = await response.json()

    if (!response.ok) {
        throw new Error(data.error || 'Failed to send reset email')
    }

    return data
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
    const response = await fetch(`${API_URL}/api/v1/auth/reset-password`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token, password }),
    })

    const data = await response.json()

    if (!response.ok) {
        throw new Error(data.error || 'Failed to reset password')
    }

    return data
}

/**
 * Validate a reset token
 * @param token - Reset token to validate
 * @returns Promise with validation result
 */
export async function validateResetToken(token: string): Promise<ValidateTokenResponse> {
    const response = await fetch(
        `${API_URL}/api/v1/auth/validate-reset-token?token=${encodeURIComponent(token)}`
    )

    const data = await response.json()

    if (!response.ok) {
        throw new Error(data.error || 'Invalid token')
    }

    return data
}
