/**
 * Unit tests for AuthForm component
 * Tests form rendering, validation triggers, and user interactions
 *
 * Validates: Requirements AC-1.1, AC-1.2, AC-3.1, AC-5.1, AC-5.3
 */

import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthForm } from '../AuthForm';
import type { AuthFormData, ValidationErrors } from '@/features/auth/types';

describe('AuthForm', () => {
    const mockFormData: AuthFormData = {
        email: '',
        password: '',
    };

    const mockSetFormData = jest.fn();
    const mockOnEmailBlur = jest.fn();
    const mockOnPasswordBlur = jest.fn();

    const defaultProps = {
        formData: mockFormData,
        setFormData: mockSetFormData,
        errors: {} as ValidationErrors,
        onEmailBlur: mockOnEmailBlur,
        onPasswordBlur: mockOnPasswordBlur,
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Rendering', () => {
        it('should render email input with correct attributes', () => {
            render(<AuthForm {...defaultProps} />);

            const emailInput = screen.getByLabelText(/email/i);
            expect(emailInput).toBeInTheDocument();
            expect(emailInput).toHaveAttribute('type', 'email');
            expect(emailInput).toHaveAttribute('placeholder', 'user@example.com');
            expect(emailInput).toHaveAttribute('required');
        });

        it('should render password input with correct attributes', () => {
            render(<AuthForm {...defaultProps} />);

            const passwordInput = screen.getByLabelText(/password/i);
            expect(passwordInput).toBeInTheDocument();
            expect(passwordInput).toHaveAttribute('type', 'password');
            expect(passwordInput).toHaveAttribute('placeholder', 'Минимум 6 символов');
            expect(passwordInput).toHaveAttribute('required');
        });

        it('should render "Забыл пароль?" link', () => {
            render(<AuthForm {...defaultProps} />);

            const forgotPasswordLink = screen.getByRole('link', { name: /забыл пароль/i });
            expect(forgotPasswordLink).toBeInTheDocument();
            expect(forgotPasswordLink).toHaveAttribute('href', '/auth/reset');
        });

        it('should display email value from formData', () => {
            const propsWithEmail = {
                ...defaultProps,
                formData: { email: 'test@example.com', password: '' },
            };

            render(<AuthForm {...propsWithEmail} />);

            const emailInput = screen.getByLabelText(/email/i) as HTMLInputElement;
            expect(emailInput.value).toBe('test@example.com');
        });

        it('should display password value from formData', () => {
            const propsWithPassword = {
                ...defaultProps,
                formData: { email: '', password: 'mypassword' },
            };

            render(<AuthForm {...propsWithPassword} />);

            const passwordInput = screen.getByLabelText(/password/i) as HTMLInputElement;
            expect(passwordInput.value).toBe('mypassword');
        });
    });

    describe('User Interactions', () => {
        it('should call setFormData when email changes', async () => {
            render(<AuthForm {...defaultProps} />);

            const emailInput = screen.getByLabelText(/email/i);
            await userEvent.type(emailInput, 'a');

            expect(mockSetFormData).toHaveBeenCalled();
            // Check that setFormData was called with the new character
            const lastCall = mockSetFormData.mock.calls[mockSetFormData.mock.calls.length - 1][0];
            expect(lastCall.email).toBe('a');
        });

        it('should call setFormData when password changes', async () => {
            render(<AuthForm {...defaultProps} />);

            const passwordInput = screen.getByLabelText(/password/i);
            await userEvent.type(passwordInput, 'p');

            expect(mockSetFormData).toHaveBeenCalled();
            // Check that setFormData was called with the new character
            const lastCall = mockSetFormData.mock.calls[mockSetFormData.mock.calls.length - 1][0];
            expect(lastCall.password).toBe('p');
        });

        it('should call onEmailBlur when email input loses focus', () => {
            render(<AuthForm {...defaultProps} />);

            const emailInput = screen.getByLabelText(/email/i);
            fireEvent.blur(emailInput);

            expect(mockOnEmailBlur).toHaveBeenCalledTimes(1);
        });

        it('should call onPasswordBlur when password input loses focus', () => {
            render(<AuthForm {...defaultProps} />);

            const passwordInput = screen.getByLabelText(/password/i);
            fireEvent.blur(passwordInput);

            expect(mockOnPasswordBlur).toHaveBeenCalledTimes(1);
        });

        it('should preserve existing formData when updating email', async () => {
            const propsWithPassword = {
                ...defaultProps,
                formData: { email: '', password: 'existingpassword' },
            };

            render(<AuthForm {...propsWithPassword} />);

            const emailInput = screen.getByLabelText(/email/i);
            await userEvent.type(emailInput, 'new@example.com');

            // Verify that password is preserved in setFormData calls
            const lastCall = mockSetFormData.mock.calls[mockSetFormData.mock.calls.length - 1][0];
            expect(lastCall.password).toBe('existingpassword');
        });

        it('should preserve existing formData when updating password', async () => {
            const propsWithEmail = {
                ...defaultProps,
                formData: { email: 'existing@example.com', password: '' },
            };

            render(<AuthForm {...propsWithEmail} />);

            const passwordInput = screen.getByLabelText(/password/i);
            await userEvent.type(passwordInput, 'newpassword');

            // Verify that email is preserved in setFormData calls
            const lastCall = mockSetFormData.mock.calls[mockSetFormData.mock.calls.length - 1][0];
            expect(lastCall.email).toBe('existing@example.com');
        });
    });

    describe('Error Display', () => {
        it('should display email error when provided', () => {
            const propsWithError = {
                ...defaultProps,
                errors: { email: 'Invalid email format' },
            };

            render(<AuthForm {...propsWithError} />);

            expect(screen.getByText('Invalid email format')).toBeInTheDocument();
        });

        it('should display password error when provided', () => {
            const propsWithError = {
                ...defaultProps,
                errors: { password: 'Password too short' },
            };

            render(<AuthForm {...propsWithError} />);

            expect(screen.getByText('Password too short')).toBeInTheDocument();
        });

        it('should display both email and password errors simultaneously', () => {
            const propsWithErrors = {
                ...defaultProps,
                errors: {
                    email: 'Invalid email format',
                    password: 'Password too short',
                },
            };

            render(<AuthForm {...propsWithErrors} />);

            expect(screen.getByText('Invalid email format')).toBeInTheDocument();
            expect(screen.getByText('Password too short')).toBeInTheDocument();
        });

        it('should not display errors when errors object is empty', () => {
            render(<AuthForm {...defaultProps} />);

            const errorMessages = screen.queryAllByRole('alert');
            expect(errorMessages).toHaveLength(0);
        });
    });

    describe('Accessibility', () => {
        it('should have aria-label on email input', () => {
            render(<AuthForm {...defaultProps} />);

            const emailInput = screen.getByLabelText(/email/i);
            expect(emailInput).toHaveAttribute('aria-label', 'Email address');
        });

        it('should have aria-label on password input', () => {
            render(<AuthForm {...defaultProps} />);

            const passwordInput = screen.getByLabelText(/password/i);
            expect(passwordInput).toHaveAttribute('aria-label', 'Password');
        });

        it('should set aria-invalid to true on email input when error exists', () => {
            const propsWithError = {
                ...defaultProps,
                errors: { email: 'Invalid email' },
            };

            render(<AuthForm {...propsWithError} />);

            const emailInput = screen.getByLabelText(/email/i);
            expect(emailInput).toHaveAttribute('aria-invalid', 'true');
        });

        it('should set aria-invalid to true on password input when error exists', () => {
            const propsWithError = {
                ...defaultProps,
                errors: { password: 'Password too short' },
            };

            render(<AuthForm {...propsWithError} />);

            const passwordInput = screen.getByLabelText(/password/i);
            expect(passwordInput).toHaveAttribute('aria-invalid', 'true');
        });

        it('should have aria-required on both inputs', () => {
            render(<AuthForm {...defaultProps} />);

            const emailInput = screen.getByLabelText(/email/i);
            const passwordInput = screen.getByLabelText(/password/i);

            expect(emailInput).toHaveAttribute('aria-required', 'true');
            expect(passwordInput).toHaveAttribute('aria-required', 'true');
        });
    });

    describe('Edge Cases', () => {
        it('should handle rapid typing in email field', async () => {
            render(<AuthForm {...defaultProps} />);

            const emailInput = screen.getByLabelText(/email/i);
            await userEvent.type(emailInput, 'test@example.com', { delay: 1 });

            expect(mockSetFormData).toHaveBeenCalled();
        });

        it('should handle rapid typing in password field', async () => {
            render(<AuthForm {...defaultProps} />);

            const passwordInput = screen.getByLabelText(/password/i);
            await userEvent.type(passwordInput, 'password123', { delay: 1 });

            expect(mockSetFormData).toHaveBeenCalled();
        });

        it('should handle empty string values', () => {
            const propsWithEmptyValues = {
                ...defaultProps,
                formData: { email: '', password: '' },
            };

            render(<AuthForm {...propsWithEmptyValues} />);

            const emailInput = screen.getByLabelText(/email/i) as HTMLInputElement;
            const passwordInput = screen.getByLabelText(/password/i) as HTMLInputElement;

            expect(emailInput.value).toBe('');
            expect(passwordInput.value).toBe('');
        });

        it('should handle very long email values', () => {
            const longEmail = 'a'.repeat(100) + '@example.com';
            const propsWithLongEmail = {
                ...defaultProps,
                formData: { email: longEmail, password: '' },
            };

            render(<AuthForm {...propsWithLongEmail} />);

            const emailInput = screen.getByLabelText(/email/i) as HTMLInputElement;
            expect(emailInput.value).toBe(longEmail);
        });

        it('should handle very long password values', () => {
            const longPassword = 'a'.repeat(128);
            const propsWithLongPassword = {
                ...defaultProps,
                formData: { email: '', password: longPassword },
            };

            render(<AuthForm {...propsWithLongPassword} />);

            const passwordInput = screen.getByLabelText(/password/i) as HTMLInputElement;
            expect(passwordInput.value).toBe(longPassword);
        });
    });
});
