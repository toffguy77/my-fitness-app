/**
 * Type definitions tests
 * Verifies TypeScript types are properly defined
 */

import type {
    AuthMode,
    AuthFormData,
    ConsentState,
    AuthResponse,
    AuthError,
    ValidationErrors,
} from '@/features/auth/types';

describe('Auth Types', () => {
    it('should define AuthMode type correctly', () => {
        const loginMode: AuthMode = 'login';
        const registerMode: AuthMode = 'register';

        expect(loginMode).toBe('login');
        expect(registerMode).toBe('register');
    });

    it('should define AuthFormData interface correctly', () => {
        const formData: AuthFormData = {
            email: 'test@example.com',
            password: 'password123',
        };

        expect(formData.email).toBe('test@example.com');
        expect(formData.password).toBe('password123');
    });

    it('should define ConsentState interface correctly', () => {
        const consents: ConsentState = {
            terms_of_service: true,
            privacy_policy: true,
            data_processing: true,
            marketing: false,
        };

        expect(consents.terms_of_service).toBe(true);
        expect(consents.marketing).toBe(false);
    });

    it('should define AuthResponse interface correctly', () => {
        const response: AuthResponse = {
            user: {
                id: '123',
                email: 'test@example.com',
                role: 'client',
                created_at: '2024-01-01T00:00:00Z',
            },
            token: 'jwt-token',
        };

        expect(response.user.id).toBe('123');
        expect(response.token).toBe('jwt-token');
    });

    it('should define AuthError interface correctly', () => {
        const error: AuthError = {
            code: 'invalid_credentials',
            message: 'Неверный логин или пароль',
            field: 'email',
        };

        expect(error.code).toBe('invalid_credentials');
        expect(error.message).toBe('Неверный логин или пароль');
    });

    it('should define ValidationErrors interface correctly', () => {
        const errors: ValidationErrors = {
            email: 'Invalid email format',
            password: 'Password too short',
            consents: 'All mandatory consents must be checked',
        };

        expect(errors.email).toBe('Invalid email format');
        expect(errors.password).toBe('Password too short');
    });
});
