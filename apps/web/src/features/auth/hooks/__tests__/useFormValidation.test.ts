/**
 * Tests for useFormValidation hook
 * Includes property-based tests and unit tests
 */

import { renderHook, act } from '@testing-library/react';
import fc from 'fast-check';
import { useFormValidation } from '../useFormValidation';
import type { AuthFormData, ConsentState } from '../../types';

describe('useFormValidation', () => {
    describe('Property 4: Validation Error Clearing', () => {
        it('should clear email error when valid email is entered', () => {
            // Feature: auth-screen, Property 4: Validation Error Clearing
            // **Validates: Requirements AC-5.5**

            const { result } = renderHook(() => useFormValidation());

            // First, create an error by validating invalid email
            act(() => {
                result.current.validateEmail('invalid');
            });

            expect(result.current.errors.email).toBeDefined();

            // Then validate with valid email
            act(() => {
                result.current.validateEmail('valid@example.com');
            });

            // Error should be cleared
            expect(result.current.errors.email).toBeUndefined();
        });

        it('should clear password error when valid password is entered', () => {
            // Feature: auth-screen, Property 4: Validation Error Clearing
            // **Validates: Requirements AC-5.5**

            const { result } = renderHook(() => useFormValidation());

            // First, create an error
            act(() => {
                result.current.validatePassword('12345'); // Too short
            });

            expect(result.current.errors.password).toBeDefined();

            // Then validate with valid password
            act(() => {
                result.current.validatePassword('validpassword123');
            });

            // Error should be cleared
            expect(result.current.errors.password).toBeUndefined();
        });

        it('should preserve other field errors when clearing one field', () => {
            // Feature: auth-screen, Property 4: Validation Error Clearing
            // **Validates: Requirements AC-5.5**

            const { result } = renderHook(() => useFormValidation());

            // Create errors in both fields
            act(() => {
                result.current.validateEmail('invalid');
                result.current.validatePassword('123'); // Too short
            });

            expect(result.current.errors.email).toBeDefined();
            expect(result.current.errors.password).toBeDefined();

            // Clear only email error
            act(() => {
                result.current.validateEmail('valid@example.com');
            });

            // Email error cleared, password error preserved
            expect(result.current.errors.email).toBeUndefined();
            expect(result.current.errors.password).toBeDefined();
        });
    });

    describe('Email Validation', () => {
        it('should validate correct email formats', () => {
            const validEmails = [
                'user@example.com',
                'test.user@domain.co.uk',
                'name+tag@company.org',
            ];

            validEmails.forEach(email => {
                const { result } = renderHook(() => useFormValidation());

                act(() => {
                    const isValid = result.current.validateEmail(email);
                    expect(isValid).toBe(true);
                });

                expect(result.current.errors.email).toBeUndefined();
            });
        });

        it('should reject invalid email formats', () => {
            const invalidEmails = [
                { email: '', name: 'empty string' },
                { email: 'no-at-sign.com', name: 'no @ sign' },
                { email: 'no-dot@domain', name: 'no dot after @' },
                { email: '@domain.com', name: 'missing local part' },
            ];

            invalidEmails.forEach(({ email, name }) => {
                const { result } = renderHook(() => useFormValidation());

                act(() => {
                    const isValid = result.current.validateEmail(email);
                    expect(isValid).toBe(false);
                });

                expect(result.current.errors.email).toBeDefined();
            });
        });
    });

    describe('Password Validation', () => {
        it('should validate passwords with minimum length', () => {
            const { result } = renderHook(() => useFormValidation());

            act(() => {
                const isValid = result.current.validatePassword('123456');
                expect(isValid).toBe(true);
            });

            expect(result.current.errors.password).toBeUndefined();
        });

        it('should reject passwords below minimum length', () => {
            const { result } = renderHook(() => useFormValidation());

            act(() => {
                const isValid = result.current.validatePassword('12345');
                expect(isValid).toBe(false);
            });

            expect(result.current.errors.password).toBeDefined();
        });

        it('should accept passwords with special characters', () => {
            const passwords = [
                'Pass@123',
                'пароль123',
                'password!@#$%',
                'emoji😀pass',
            ];

            passwords.forEach(password => {
                const { result } = renderHook(() => useFormValidation());

                act(() => {
                    const isValid = result.current.validatePassword(password);
                    expect(isValid).toBe(true);
                });
            });
        });
    });

    describe('Login Validation', () => {
        it('should validate complete login form', () => {
            const { result } = renderHook(() => useFormValidation());

            const validData: AuthFormData = {
                email: 'user@example.com',
                password: 'password123',
            };

            act(() => {
                const isValid = result.current.validateLogin(validData);
                expect(isValid).toBe(true);
                expect(result.current.errors).toEqual({});
            });
        });

        it('should reject login with invalid email', () => {
            const { result } = renderHook(() => useFormValidation());

            const invalidData: AuthFormData = {
                email: 'invalid-email',
                password: 'password123',
            };

            act(() => {
                const isValid = result.current.validateLogin(invalidData);
                expect(isValid).toBe(false);
            });

            expect(result.current.errors.email).toBeDefined();
        });

        it('should reject login with short password', () => {
            const { result } = renderHook(() => useFormValidation());

            const invalidData: AuthFormData = {
                email: 'user@example.com',
                password: '123',
            };

            act(() => {
                const isValid = result.current.validateLogin(invalidData);
                expect(isValid).toBe(false);
            });

            expect(result.current.errors.password).toBeDefined();
        });
    });

    describe('Registration Validation', () => {
        it('should validate complete registration form', () => {
            const { result } = renderHook(() => useFormValidation());

            const validData: AuthFormData = {
                email: 'user@example.com',
                password: 'password123',
            };

            const validConsents: ConsentState = {
                terms_of_service: true,
                privacy_policy: true,
                data_processing: true,
                marketing: false,
            };

            act(() => {
                const isValid = result.current.validateRegister(validData, validConsents);
                expect(isValid).toBe(true);
                expect(result.current.errors).toEqual({});
            });
        });

        it('should reject registration without mandatory consents', () => {
            const { result } = renderHook(() => useFormValidation());

            const validData: AuthFormData = {
                email: 'user@example.com',
                password: 'password123',
            };

            const invalidConsents: ConsentState = {
                terms_of_service: true,
                privacy_policy: false, // Missing mandatory consent
                data_processing: true,
                marketing: false,
            };

            act(() => {
                const isValid = result.current.validateRegister(validData, invalidConsents);
                expect(isValid).toBe(false);
            });

            expect(result.current.errors.consents).toBeDefined();
        });

        it('should allow registration without marketing consent', () => {
            const { result } = renderHook(() => useFormValidation());

            const validData: AuthFormData = {
                email: 'user@example.com',
                password: 'password123',
            };

            const consents: ConsentState = {
                terms_of_service: true,
                privacy_policy: true,
                data_processing: true,
                marketing: false, // Optional consent
            };

            act(() => {
                const isValid = result.current.validateRegister(validData, consents);
                expect(isValid).toBe(true);
            });
        });

        it('should reject registration with invalid email and show field error', () => {
            const { result } = renderHook(() => useFormValidation());

            const invalidData: AuthFormData = {
                email: 'invalid-email',
                password: 'password123',
            };

            const validConsents: ConsentState = {
                terms_of_service: true,
                privacy_policy: true,
                data_processing: true,
                marketing: false,
            };

            act(() => {
                const isValid = result.current.validateRegister(invalidData, validConsents);
                expect(isValid).toBe(false);
            });

            expect(result.current.errors.email).toBeDefined();
            expect(result.current.errors.consents).toBeUndefined();
        });

        it('should reject registration with short password and show field error', () => {
            const { result } = renderHook(() => useFormValidation());

            const invalidData: AuthFormData = {
                email: 'user@example.com',
                password: '123',
            };

            const validConsents: ConsentState = {
                terms_of_service: true,
                privacy_policy: true,
                data_processing: true,
                marketing: false,
            };

            act(() => {
                const isValid = result.current.validateRegister(invalidData, validConsents);
                expect(isValid).toBe(false);
            });

            expect(result.current.errors.password).toBeDefined();
            expect(result.current.errors.consents).toBeUndefined();
        });
    });

    describe('Error Management', () => {
        it('should clear all errors', () => {
            const { result } = renderHook(() => useFormValidation());

            // Create multiple errors
            act(() => {
                result.current.validateEmail('invalid');
                result.current.validatePassword('123');
            });

            expect(Object.keys(result.current.errors).length).toBeGreaterThan(0);

            // Clear all errors
            act(() => {
                result.current.clearErrors();
            });

            expect(result.current.errors).toEqual({});
        });

        it('should clear specific field error', () => {
            const { result } = renderHook(() => useFormValidation());

            // Create errors
            act(() => {
                result.current.validateEmail('invalid');
                result.current.validatePassword('123');
            });

            // Clear only email error
            act(() => {
                result.current.clearFieldError('email');
            });

            expect(result.current.errors.email).toBeUndefined();
            expect(result.current.errors.password).toBeDefined();
        });
    });
});
