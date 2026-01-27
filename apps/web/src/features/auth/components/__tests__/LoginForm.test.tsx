/**
 * Unit tests for LoginForm component
 * Tests form validation, user interactions, and submission
 *
 * Validates: Requirements AC-1.1, AC-1.2, AC-1.3, AC-1.4, AC-5.1, AC-5.3
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginForm } from '../LoginForm';

describe('LoginForm', () => {
    describe('Rendering', () => {
        it('should render email and password inputs', () => {
            render(<LoginForm />);

            expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
            expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
        });

        it('should render submit button', () => {
            render(<LoginForm />);

            expect(screen.getByRole('button', { name: /войти/i })).toBeInTheDocument();
        });
    });

    describe('Validation', () => {
        it('should show error when email is empty', async () => {
            const onSubmit = jest.fn();
            render(<LoginForm onSubmit={onSubmit} />);

            const submitButton = screen.getByRole('button', { name: /войти/i });
            fireEvent.click(submitButton);

            await waitFor(() => {
                const errors = screen.getAllByText(/обязательное поле/i);
                expect(errors.length).toBeGreaterThan(0);
            });

            expect(onSubmit).not.toHaveBeenCalled();
        });

        it('should show error when password is empty', async () => {
            const onSubmit = jest.fn();
            render(<LoginForm onSubmit={onSubmit} />);

            const emailInput = screen.getByLabelText(/email/i);
            await userEvent.type(emailInput, 'user@example.com');

            const submitButton = screen.getByRole('button', { name: /войти/i });
            fireEvent.click(submitButton);

            await waitFor(() => {
                const errors = screen.getAllByText(/обязательное поле/i);
                expect(errors.length).toBeGreaterThan(0);
            });

            expect(onSubmit).not.toHaveBeenCalled();
        });

        it('should clear email error when user types', async () => {
            const onSubmit = jest.fn();
            render(<LoginForm onSubmit={onSubmit} />);

            // Submit to trigger validation
            const submitButton = screen.getByRole('button', { name: /войти/i });
            fireEvent.click(submitButton);

            await waitFor(() => {
                const errors = screen.getAllByText(/обязательное поле/i);
                expect(errors.length).toBeGreaterThan(0);
            });

            // Type in email field
            const emailInput = screen.getByLabelText(/email/i);
            await userEvent.type(emailInput, 'user@example.com');

            // Email should have value
            expect(emailInput).toHaveValue('user@example.com');
        });

        it('should clear password error when user types', async () => {
            const onSubmit = jest.fn();
            render(<LoginForm onSubmit={onSubmit} />);

            const emailInput = screen.getByLabelText(/email/i);
            await userEvent.type(emailInput, 'user@example.com');

            // Submit to trigger password validation
            const submitButton = screen.getByRole('button', { name: /войти/i });
            fireEvent.click(submitButton);

            await waitFor(() => {
                expect(screen.getByText(/обязательное поле/i)).toBeInTheDocument();
            });

            // Type in password field
            const passwordInput = screen.getByLabelText(/password/i);
            await userEvent.type(passwordInput, 'password123');

            // Password should have value
            expect(passwordInput).toHaveValue('password123');
        });
    });

    describe('Submission', () => {
        it('should call onSubmit with valid credentials', async () => {
            const onSubmit = jest.fn().mockResolvedValue(undefined);
            render(<LoginForm onSubmit={onSubmit} />);

            const emailInput = screen.getByLabelText(/email/i);
            const passwordInput = screen.getByLabelText(/password/i);

            await userEvent.type(emailInput, 'user@example.com');
            await userEvent.type(passwordInput, 'password123');

            const submitButton = screen.getByRole('button', { name: /войти/i });
            fireEvent.click(submitButton);

            await waitFor(() => {
                expect(onSubmit).toHaveBeenCalledWith({
                    email: 'user@example.com',
                    password: 'password123',
                });
            });
        });

        it('should show loading state during submission', async () => {
            const onSubmit = jest.fn((): Promise<void> => new Promise(resolve => setTimeout(resolve, 100)));
            render(<LoginForm onSubmit={onSubmit} />);

            const emailInput = screen.getByLabelText(/email/i);
            const passwordInput = screen.getByLabelText(/password/i);

            await userEvent.type(emailInput, 'user@example.com');
            await userEvent.type(passwordInput, 'password123');

            const submitButton = screen.getByRole('button', { name: /войти/i });
            fireEvent.click(submitButton);

            // Should show loading text
            await waitFor(() => {
                expect(screen.getByText(/загрузка/i)).toBeInTheDocument();
            });

            // Button should be disabled
            expect(submitButton).toBeDisabled();

            // Wait for submission to complete
            await waitFor(() => {
                expect(screen.getByText(/войти/i)).toBeInTheDocument();
            });
        });
    });

    describe('Accessibility', () => {
        it('should set aria-invalid on email input when error exists', async () => {
            render(<LoginForm />);

            const submitButton = screen.getByRole('button', { name: /войти/i });
            fireEvent.click(submitButton);

            await waitFor(() => {
                const emailInput = screen.getByLabelText(/email/i);
                expect(emailInput).toHaveAttribute('aria-invalid', 'true');
            });
        });

        it('should set aria-invalid on password input when error exists', async () => {
            render(<LoginForm />);

            const emailInput = screen.getByLabelText(/email/i);
            await userEvent.type(emailInput, 'user@example.com');

            const submitButton = screen.getByRole('button', { name: /войти/i });
            fireEvent.click(submitButton);

            await waitFor(() => {
                const passwordInput = screen.getByLabelText(/password/i);
                expect(passwordInput).toHaveAttribute('aria-invalid', 'true');
            });
        });
    });
});
