/**
 * AddCustomRecommendationForm Unit Tests
 *
 * Tests for the custom nutrient recommendation form modal.
 *
 * @module food-tracker/components/__tests__/AddCustomRecommendationForm.test
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddCustomRecommendationForm } from '../AddCustomRecommendationForm';

// ============================================================================
// Mocks
// ============================================================================

jest.mock('lucide-react', () => ({
    X: ({ className }: { className?: string }) => (
        <span data-testid="x-icon" className={className}>x</span>
    ),
    Plus: ({ className }: { className?: string }) => (
        <span data-testid="plus-icon" className={className}>+</span>
    ),
}));

// ============================================================================
// Helpers
// ============================================================================

function renderForm(props: Partial<React.ComponentProps<typeof AddCustomRecommendationForm>> = {}) {
    const defaultProps = {
        isOpen: true,
        onClose: jest.fn(),
        onAdd: jest.fn(),
        ...props,
    };
    return { ...render(<AddCustomRecommendationForm {...defaultProps} />), props: defaultProps };
}

// ============================================================================
// Tests
// ============================================================================

describe('AddCustomRecommendationForm', () => {
    describe('Rendering', () => {
        it('renders nothing when isOpen is false', () => {
            renderForm({ isOpen: false });

            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });

        it('renders modal dialog when isOpen is true', () => {
            renderForm();

            expect(screen.getByRole('dialog')).toBeInTheDocument();
        });

        it('displays title "Добавить рекомендацию"', () => {
            renderForm();

            expect(screen.getByText('Добавить рекомендацию')).toBeInTheDocument();
        });

        it('renders name input with label', () => {
            renderForm();

            expect(screen.getByLabelText(/Название/)).toBeInTheDocument();
        });

        it('renders daily target input with label', () => {
            renderForm();

            expect(screen.getByLabelText(/Дневная норма/)).toBeInTheDocument();
        });

        it('renders unit selector with label', () => {
            renderForm();

            expect(screen.getByLabelText(/Единица измерения/)).toBeInTheDocument();
        });

        it('renders all unit options', () => {
            renderForm();

            expect(screen.getByText('Граммы (г)')).toBeInTheDocument();
            expect(screen.getByText('Миллиграммы (мг)')).toBeInTheDocument();
            expect(screen.getByText('Микрограммы (мкг)')).toBeInTheDocument();
            expect(screen.getByText('Международные единицы (МЕ)')).toBeInTheDocument();
        });

        it('renders cancel and submit buttons', () => {
            renderForm();

            expect(screen.getByRole('button', { name: 'Отмена' })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /Добавить/ })).toBeInTheDocument();
        });

        it('renders close button with aria-label', () => {
            renderForm();

            expect(screen.getByRole('button', { name: 'Закрыть' })).toBeInTheDocument();
        });

        it('applies custom className', () => {
            renderForm({ className: 'custom-test-class' });

            const dialog = screen.getByRole('dialog');
            expect(dialog).toHaveClass('custom-test-class');
        });
    });

    describe('Input Handling', () => {
        it('updates name field on input', async () => {
            const user = userEvent.setup();
            renderForm();

            const nameInput = screen.getByLabelText(/Название/);
            await user.type(nameInput, 'Омега-3');

            expect(nameInput).toHaveValue('Омега-3');
        });

        it('updates daily target field on input', async () => {
            const user = userEvent.setup();
            renderForm();

            const targetInput = screen.getByLabelText(/Дневная норма/);
            await user.type(targetInput, '1000');

            expect(targetInput).toHaveValue('1000');
        });

        it('rejects non-numeric characters in daily target', async () => {
            const user = userEvent.setup();
            renderForm();

            const targetInput = screen.getByLabelText(/Дневная норма/);
            await user.type(targetInput, 'abc');

            expect(targetInput).toHaveValue('');
        });

        it('allows decimal values in daily target', async () => {
            const user = userEvent.setup();
            renderForm();

            const targetInput = screen.getByLabelText(/Дневная норма/);
            await user.type(targetInput, '2.5');

            expect(targetInput).toHaveValue('2.5');
        });

        it('changes unit selection', async () => {
            const user = userEvent.setup();
            renderForm();

            const unitSelect = screen.getByLabelText(/Единица измерения/);
            await user.selectOptions(unitSelect, 'мкг');

            expect(unitSelect).toHaveValue('мкг');
        });
    });

    describe('Validation', () => {
        it('shows error when name is empty on blur', async () => {
            const user = userEvent.setup();
            renderForm();

            const nameInput = screen.getByLabelText(/Название/);
            await user.click(nameInput);
            await user.tab();

            await waitFor(() => {
                expect(screen.getByText('Название обязательно для заполнения')).toBeInTheDocument();
            });
        });

        it('shows error when name is too short on blur', async () => {
            const user = userEvent.setup();
            renderForm();

            const nameInput = screen.getByLabelText(/Название/);
            await user.type(nameInput, 'A');
            await user.tab();

            await waitFor(() => {
                expect(screen.getByText('Название должно содержать минимум 2 символа')).toBeInTheDocument();
            });
        });

        it('shows error when daily target is empty on blur', async () => {
            const user = userEvent.setup();
            renderForm();

            const targetInput = screen.getByLabelText(/Дневная норма/);
            await user.click(targetInput);
            await user.tab();

            await waitFor(() => {
                expect(screen.getByText('Дневная норма обязательна для заполнения')).toBeInTheDocument();
            });
        });

        it('shows validation errors when fields are blurred empty', async () => {
            const user = userEvent.setup();
            const { props } = renderForm();

            // Blur name field
            const nameInput = screen.getByLabelText(/Название/);
            await user.click(nameInput);
            await user.tab();

            // Blur daily target field
            const targetInput = screen.getByLabelText(/Дневная норма/);
            await user.click(targetInput);
            await user.tab();

            await waitFor(() => {
                expect(screen.getByText('Название обязательно для заполнения')).toBeInTheDocument();
                expect(screen.getByText('Дневная норма обязательна для заполнения')).toBeInTheDocument();
            });

            expect(props.onAdd).not.toHaveBeenCalled();
        });

        it('disables submit button when form is invalid', () => {
            renderForm();

            const submitButton = screen.getByRole('button', { name: /Добавить/ });
            expect(submitButton).toBeDisabled();
        });

        it('enables submit button when form is valid', async () => {
            const user = userEvent.setup();
            renderForm();

            await user.type(screen.getByLabelText(/Название/), 'Омега-3');
            await user.type(screen.getByLabelText(/Дневная норма/), '1000');

            const submitButton = screen.getByRole('button', { name: /Добавить/ });
            expect(submitButton).not.toBeDisabled();
        });
    });

    describe('Submission', () => {
        it('calls onAdd with form data on valid submit', async () => {
            const user = userEvent.setup();
            const { props } = renderForm();

            await user.type(screen.getByLabelText(/Название/), 'Омега-3');
            await user.type(screen.getByLabelText(/Дневная норма/), '1000');

            const submitButton = screen.getByRole('button', { name: /Добавить/ });
            await user.click(submitButton);

            expect(props.onAdd).toHaveBeenCalledWith({
                name: 'Омега-3',
                dailyTarget: 1000,
                unit: 'мг',
            });
        });

        it('calls onClose after successful submit', async () => {
            const user = userEvent.setup();
            const { props } = renderForm();

            await user.type(screen.getByLabelText(/Название/), 'Витамин D');
            await user.type(screen.getByLabelText(/Дневная норма/), '20');

            await user.click(screen.getByRole('button', { name: /Добавить/ }));

            expect(props.onClose).toHaveBeenCalledTimes(1);
        });

        it('submits with selected unit', async () => {
            const user = userEvent.setup();
            const { props } = renderForm();

            await user.type(screen.getByLabelText(/Название/), 'Витамин D');
            await user.type(screen.getByLabelText(/Дневная норма/), '20');
            await user.selectOptions(screen.getByLabelText(/Единица измерения/), 'мкг');

            await user.click(screen.getByRole('button', { name: /Добавить/ }));

            expect(props.onAdd).toHaveBeenCalledWith({
                name: 'Витамин D',
                dailyTarget: 20,
                unit: 'мкг',
            });
        });
    });

    describe('Close Behavior', () => {
        it('calls onClose when close button is clicked', async () => {
            const user = userEvent.setup();
            const { props } = renderForm();

            await user.click(screen.getByRole('button', { name: 'Закрыть' }));

            expect(props.onClose).toHaveBeenCalledTimes(1);
        });

        it('calls onClose when cancel button is clicked', async () => {
            const user = userEvent.setup();
            const { props } = renderForm();

            await user.click(screen.getByRole('button', { name: 'Отмена' }));

            expect(props.onClose).toHaveBeenCalledTimes(1);
        });

        it('calls onClose when Escape key is pressed', () => {
            const { props } = renderForm();

            fireEvent.keyDown(document, { key: 'Escape' });

            expect(props.onClose).toHaveBeenCalledTimes(1);
        });

        it('calls onClose when clicking backdrop', () => {
            const { props } = renderForm();

            const dialog = screen.getByRole('dialog');
            fireEvent.click(dialog);

            expect(props.onClose).toHaveBeenCalledTimes(1);
        });
    });

    describe('Form Reset', () => {
        it('resets form fields when modal reopens', async () => {
            const user = userEvent.setup();
            const { rerender } = render(
                <AddCustomRecommendationForm
                    isOpen={true}
                    onClose={jest.fn()}
                    onAdd={jest.fn()}
                />
            );

            await user.type(screen.getByLabelText(/Название/), 'Test');

            // Close and reopen
            rerender(
                <AddCustomRecommendationForm
                    isOpen={false}
                    onClose={jest.fn()}
                    onAdd={jest.fn()}
                />
            );
            rerender(
                <AddCustomRecommendationForm
                    isOpen={true}
                    onClose={jest.fn()}
                    onAdd={jest.fn()}
                />
            );

            await waitFor(() => {
                expect(screen.getByLabelText(/Название/)).toHaveValue('');
            });
        });
    });

    describe('Accessibility', () => {
        it('has aria-modal attribute', () => {
            renderForm();

            expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
        });

        it('has aria-labelledby pointing to title', () => {
            renderForm();

            const dialog = screen.getByRole('dialog');
            expect(dialog).toHaveAttribute('aria-labelledby', 'add-recommendation-title');
        });

        it('marks invalid fields with aria-invalid', async () => {
            const user = userEvent.setup();
            renderForm();

            const nameInput = screen.getByLabelText(/Название/);
            await user.click(nameInput);
            await user.tab();

            await waitFor(() => {
                expect(nameInput).toHaveAttribute('aria-invalid', 'true');
            });
        });

        it('shows error messages with role="alert"', async () => {
            const user = userEvent.setup();
            renderForm();

            // Trigger validation by blurring empty name field
            const nameInput = screen.getByLabelText(/Название/);
            await user.click(nameInput);
            await user.tab();

            await waitFor(() => {
                const alerts = screen.getAllByRole('alert');
                expect(alerts.length).toBeGreaterThanOrEqual(1);
            });
        });
    });
});
