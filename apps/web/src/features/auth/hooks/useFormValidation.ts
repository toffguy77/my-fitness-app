/**
 * Form validation hook for authentication forms
 * Provides validation functions and error state management
 *
 * Validates: Requirements AC-5.1, AC-5.3, AC-5.5
 */

import { useState, useCallback } from 'react';
import { z } from 'zod';
import { loginSchema, registerSchema, emailSchema, passwordSchema } from '@/features/auth/utils/validation';
import type { AuthFormData, ConsentState, ValidationErrors } from '@/features/auth/types';

/**
 * The problems zod reported, or none if the throw came from somewhere else.
 *
 * `schema.parse` throws `unknown` as far as the type system is concerned. This
 * says out loud what reading `err.issues` off an `any` left implicit: anything
 * that is not a zod failure carries no issues, and the caller shows its own
 * fallback sentence.
 */
function issuesOf(err: unknown): z.core.$ZodIssue[] {
    return err instanceof z.ZodError ? err.issues : [];
}

export function useFormValidation() {
    const [errors, setErrors] = useState<ValidationErrors>({});

    /**
     * Validate email field
     * Validates: AC-5.1 (email format on blur)
     */
    const validateEmail = useCallback((email: string): boolean => {
        try {
            emailSchema.parse(email);
            setErrors((prev) => ({ ...prev, email: undefined }));
            return true;
        } catch (err) {
            const errorMessage = issuesOf(err)[0]?.message || 'Invalid email';
            setErrors((prev) => ({ ...prev, email: errorMessage }));
            return false;
        }
    }, []);

    /**
     * Validate password field
     * Validates: AC-5.3 (password minimum length)
     */
    const validatePassword = useCallback((password: string): boolean => {
        try {
            passwordSchema.parse(password);
            setErrors((prev) => ({ ...prev, password: undefined }));
            return true;
        } catch (err) {
            const errorMessage = issuesOf(err)[0]?.message || 'Invalid password';
            setErrors((prev) => ({ ...prev, password: errorMessage }));
            return false;
        }
    }, []);

    /**
     * Validate login form (email + password)
     * Validates: AC-1.1, AC-1.2, AC-1.7 (no consent validation for login)
     */
    const validateLogin = useCallback((data: AuthFormData): boolean => {
        try {
            loginSchema.parse(data);
            setErrors({});
            return true;
        } catch (err) {
            const validationErrors: ValidationErrors = {};
            issuesOf(err).forEach((issue) => {
                const field = issue.path[0] as keyof ValidationErrors;
                validationErrors[field] = issue.message;
            });
            setErrors(validationErrors);
            return false;
        }
    }, []);

    /**
     * Validate registration form (email + password + consents)
     * Validates: AC-2.1, AC-2.2, AC-2.3, AC-2.4, AC-2.5
     */
    const validateRegister = useCallback(
        (data: AuthFormData, consents: ConsentState): boolean => {
            try {
                registerSchema.parse({ ...data, consents });
                setErrors({});
                return true;
            } catch (err) {
                const validationErrors: ValidationErrors = {};
                issuesOf(err).forEach((issue) => {
                    const field = issue.path[0];
                    if (field === 'consents') {
                        validationErrors.consents = issue.message;
                    } else {
                        validationErrors[field as keyof ValidationErrors] = issue.message;
                    }
                });
                setErrors(validationErrors);
                return false;
            }
        },
        []
    );

    /**
     * Clear all validation errors
     * Validates: AC-5.5 (errors cleared when user corrects input)
     */
    const clearErrors = useCallback(() => {
        setErrors({});
    }, []);

    /**
     * Clear specific field error
     * Validates: AC-5.5 (field-specific error clearing)
     */
    const clearFieldError = useCallback((field: keyof ValidationErrors) => {
        setErrors((prev) => {
            const newErrors = { ...prev };
            delete newErrors[field];
            return newErrors;
        });
    }, []);

    return {
        errors,
        validateEmail,
        validatePassword,
        validateLogin,
        validateRegister,
        clearErrors,
        clearFieldError,
    };
}
