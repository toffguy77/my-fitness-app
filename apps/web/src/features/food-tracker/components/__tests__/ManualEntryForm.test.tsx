/**
 * ManualEntryForm Unit Tests
 *
 * Tests for the manual food entry form component.
 *
 * @module food-tracker/components/__tests__/ManualEntryForm.test
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ManualEntryForm } from '../ManualEntryForm';

// ============================================================================
// Mocks
// ============================================================================

jest.mock('lucide-react', () => ({
    Save: ({ className }: { className?: string }) => (
        <span data-testid="save-icon" className={className}>save</span>
    ),
    X: ({ className }: { className?: string }) => (
        <span data-testid="x-icon" className={className}>x</span>
    ),
}));

const mockApiPost = jest.fn();
jest.mock('@/shared/utils/api-client', () => ({
    apiClient: {
        post: (...args: unknown[]) => mockApiPost(...args),
    },
}));

jest.mock('@/config/api', () => ({
    getApiUrl: (path: string) => `http://localhost:4000/api${path}`,
}));

// ============================================================================
// Helpers
// ============================================================================

function renderForm(props: Partial<React.ComponentProps<typeof ManualEntryForm>> = {}) {
    const defaultProps = {
        onSubmit: jest.fn(),
        onCancel: jest.fn(),
        ...props,
    };
    return { ...render(<ManualEntryForm {...defaultProps} />), props: defaultProps };
}

// ============================================================================
// Tests
// ============================================================================

describe('ManualEntryForm', () => {
    beforeEach(() => {
        mockApiPost.mockReset();
    });

    describe('Rendering', () => {
        it('renders form title', () => {
            renderForm();

            expect(screen.getByText('Ввести продукт вручную')).toBeInTheDocument();
        });

        it('renders name input with label', () => {
            renderForm();

            expect(screen.getByLabelText(/Название продукта/)).toBeInTheDocument();
        });

        it('renders brand input with label', () => {
            renderForm();

            expect(screen.getByLabelText(/Бренд/)).toBeInTheDocument();
        });

        it('renders nutrition fields', () => {
            renderForm();

            expect(screen.getByLabelText(/Калории/)).toBeInTheDocument();
            expect(screen.getByLabelText(/Белки/)).toBeInTheDocument();
            expect(screen.getByLabelText(/Жиры/)).toBeInTheDocument();
            expect(screen.getByLabelText(/Углеводы/)).toBeInTheDocument();
        });

        it('renders serving size input', () => {
            renderForm();

            expect(screen.getByLabelText(/Размер порции/)).toBeInTheDocument();
        });

        it('renders cancel and save buttons', () => {
            renderForm();

            expect(screen.getByText('Отмена')).toBeInTheDocument();
            expect(screen.getByText('Сохранить')).toBeInTheDocument();
        });

        it('pre-fills name from initialName prop', () => {
            renderForm({ initialName: 'Овсяная каша' });

            expect(screen.getByLabelText(/Название продукта/)).toHaveValue('Овсяная каша');
        });

        it('defaults serving size to 100', () => {
            renderForm();

            expect(screen.getByLabelText(/Размер порции/)).toHaveValue(100);
        });

        it('shows nutrition section header', () => {
            renderForm();

            expect(screen.getByText('Пищевая ценность на 100г')).toBeInTheDocument();
        });
    });

    describe('Input Handling', () => {
        it('updates name field on input', async () => {
            const user = userEvent.setup();
            renderForm();

            const nameInput = screen.getByLabelText(/Название продукта/);
            await user.clear(nameInput);
            await user.type(nameInput, 'Рис');

            expect(nameInput).toHaveValue('Рис');
        });

        it('updates calories field on input', async () => {
            const user = userEvent.setup();
            renderForm();

            const caloriesInput = screen.getByLabelText(/Калории/);
            await user.type(caloriesInput, '350');

            expect(caloriesInput).toHaveValue(350);
        });

        it('updates brand field on input', async () => {
            const user = userEvent.setup();
            renderForm();

            const brandInput = screen.getByLabelText(/Бренд/);
            await user.type(brandInput, 'Myllyn Paras');

            expect(brandInput).toHaveValue('Myllyn Paras');
        });
    });

    describe('Validation', () => {
        it('shows error when name is empty on submit', async () => {
            const user = userEvent.setup();
            renderForm();

            await user.type(screen.getByLabelText(/Калории/), '100');
            await user.click(screen.getByText('Сохранить'));

            expect(screen.getByText('Введите название продукта')).toBeInTheDocument();
        });

        it('shows error when calories is invalid on submit', async () => {
            const user = userEvent.setup();
            renderForm();

            await user.type(screen.getByLabelText(/Название продукта/), 'Тест');
            await user.click(screen.getByText('Сохранить'));

            expect(screen.getByText('Введите корректное значение калорий')).toBeInTheDocument();
        });

        it('clears error when user starts typing', async () => {
            const user = userEvent.setup();
            renderForm();

            // Trigger validation
            await user.click(screen.getByText('Сохранить'));
            expect(screen.getByText('Введите название продукта')).toBeInTheDocument();

            // Type to clear error
            await user.type(screen.getByLabelText(/Название продукта/), 'Т');

            expect(screen.queryByText('Введите название продукта')).not.toBeInTheDocument();
        });

        it('marks invalid fields with aria-invalid', async () => {
            const user = userEvent.setup();
            renderForm();

            await user.click(screen.getByText('Сохранить'));

            expect(screen.getByLabelText(/Название продукта/)).toHaveAttribute('aria-invalid', 'true');
        });
    });

    describe('Submission', () => {
        it('calls API and onSubmit with created food on valid submit', async () => {
            const user = userEvent.setup();
            const mockUserFood = {
                id: 'uf-1',
                name: 'Рис',
                calories_per_100: 350,
                protein_per_100: 7,
                fat_per_100: 1,
                carbs_per_100: 78,
                serving_size: 100,
                serving_unit: 'г',
                created_at: '2026-01-01',
                updated_at: '2026-01-01',
            };
            mockApiPost.mockResolvedValueOnce(mockUserFood);

            const { props } = renderForm();

            await user.type(screen.getByLabelText(/Название продукта/), 'Рис');
            await user.type(screen.getByLabelText(/Калории/), '350');
            await user.type(screen.getByLabelText(/Белки/), '7');
            await user.type(screen.getByLabelText(/Жиры/), '1');
            await user.type(screen.getByLabelText(/Углеводы/), '78');

            await user.click(screen.getByText('Сохранить'));

            await waitFor(() => {
                expect(mockApiPost).toHaveBeenCalledTimes(1);
                expect(props.onSubmit).toHaveBeenCalledWith(
                    expect.objectContaining({
                        id: 'uf-1',
                        name: 'Рис',
                    })
                );
            });
        });

        it('shows loading state during submission', async () => {
            const user = userEvent.setup();
            let resolvePost: (v: unknown) => void;
            mockApiPost.mockReturnValueOnce(
                new Promise((resolve) => { resolvePost = resolve; })
            );

            renderForm();

            await user.type(screen.getByLabelText(/Название продукта/), 'Рис');
            await user.type(screen.getByLabelText(/Калории/), '350');

            await user.click(screen.getByText('Сохранить'));

            await waitFor(() => {
                expect(screen.getByText('Сохранение...')).toBeInTheDocument();
            });

            // Resolve to avoid act warnings
            resolvePost!({
                id: 'uf-1', name: 'Рис',
                calories_per_100: 350, protein_per_100: 0, fat_per_100: 0, carbs_per_100: 0,
                serving_size: 100, serving_unit: 'г', created_at: '', updated_at: '',
            });
        });

        it('handles API error gracefully', async () => {
            const user = userEvent.setup();
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
            mockApiPost.mockRejectedValueOnce(new Error('Network error'));

            renderForm();

            await user.type(screen.getByLabelText(/Название продукта/), 'Рис');
            await user.type(screen.getByLabelText(/Калории/), '350');

            await user.click(screen.getByText('Сохранить'));

            await waitFor(() => {
                expect(consoleSpy).toHaveBeenCalledWith(
                    'Failed to create user food:',
                    expect.any(Error)
                );
            });

            consoleSpy.mockRestore();
        });
    });

    describe('Cancel Behavior', () => {
        it('calls onCancel when cancel button is clicked', async () => {
            const user = userEvent.setup();
            const { props } = renderForm();

            await user.click(screen.getByText('Отмена'));

            expect(props.onCancel).toHaveBeenCalledTimes(1);
        });
    });
});
