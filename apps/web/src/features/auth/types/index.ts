/**
 * Authentication feature type definitions
 */

export type AuthMode = 'login' | 'register';

export interface AuthFormData {
    email: string;
    password: string;
}

export interface ConsentState {
    terms_of_service: boolean;
    privacy_policy: boolean;
    data_processing: boolean;
    marketing: boolean;
}

/**
 * Response from Golang backend authentication endpoints
 */
export interface AuthResponse {
    user: {
        id: string;
        email: string;
        name?: string;
        role: 'client' | 'coordinator' | 'super_admin';
        created_at: string;
    };
    token: string; // JWT token
}

export interface AuthError {
    code: 'invalid_credentials' | 'user_exists' | 'network_error' | 'server_error' | 'validation_error';
    message: string;
    field?: 'email' | 'password' | 'consents';
}

export interface ValidationErrors {
    email?: string;
    password?: string;
    consents?: string;
}
