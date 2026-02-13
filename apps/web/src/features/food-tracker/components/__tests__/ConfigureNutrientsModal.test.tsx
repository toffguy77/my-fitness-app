/**
 * Unit tests for ConfigureNutrientsModal component
 *
 * Tests:
 * - Checkbox toggling
 * - Select all/deselect functionality
 * - Save functionality
 * - Modal behavior (open/close)
 * - Russian labels
 *
 * @module food-tracker/components/__tests__/ConfigureNutrientsModal.test
 */

import React from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { ConfigureNutrientsModal } from '../ConfigureNutrientsModal';
import type { NutrientRecommendation } from '../../types';

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
    X: ({ className }: { className?: string }) => (
        <svg data-testid="x-icon" className={className} />
    ),
    Check: ({ className }: { className?: string }) => (
        <svg data-testid="check-icon" className={className} />
    ),
    ChevronDown: ({ className }: { className?: string }) => (
        <svg data-testid="chevron-down-icon" className={className} />
    ),
    ChevronUp: ({ className }: { className?: string }) => (
        <svg data-testid="chevron-up-icon" className={className} />
    ),
}));

// ============================================================================
// Test Data
// ============================================================================

const createMockNutrients = (): NutrientRecommendation[] => [
    {
        id: 'vitamin-c',
        name: 'Витамин C',
        category: 'vitamins',
        dailyTarget: 90,
        unit: 'мг',
        isWeekly: false,
        isCustom: false,
    },
    {
        id: 'vitamin-d',
        name: 'Витамин D',
        category: 'vitamins',
        dailyTarget: 15,
        unit: 'мкг',
        isWeekly: false,
        isCustom: false,
    },
    {
        id: 'vitamin-b12',
        name: 'Витамин B12',
        category: 'vitamins',
        dailyTarget: 2.4,
        unit: 'мкг',
        isWeekly: false,
        isCustom: false,
    },
    {
        id: 'iron',
        name: 'Железо',
        category: 'minerals',
        dailyTarget: 18,
        unit: 'мг',
        isWeekly: false,
        isCustom: false,
    },
    {
        id: 'calcium',
        name: 'Кальций',
        category: 'minerals',
        dailyTarget: 1000,
        unit: 'мг',
        isWeekly: false,
        isCustom: false,
    },
    {
        id: 'omega-3',
        name: 'Омега-3',
        category: 'lipids',
        dailyTarget: 1.6,
        unit: 'г',
        isWeekly: false,
        isCustom: false,
    },
];

const mockOnClose = jest.fn();
const mockOnSave = jest.fn();

// ============================================================================
// Test Suite
// ============================================================================

describe('ConfigureNutrientsModal', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // ========================================================================
    // Modal Behavior Tests
    // ========================================================================

    describe('modal behavior', () => {
        it('renders nothing when isOpen is false', () => {
            const { container } = render(
                <ConfigureNutrientsModal
                    isOpen={false}
                    nutrients={createMockNutrients()}
                    selectedIds={[]}
                    onClose={mockOnClose}
                    onSave={mockOnSave}
                />
            );

            expect(container.firstChild).toBeNull();
        });

        it('renders modal when isOpen is true', () => {
            render(
                <ConfigureNutrientsModal
                    isOpen={true}
                    nutrients={createMockNutrients()}
                    selectedIds={[]}
                    onClose={mockOnClose}
                    onSave={mockOnSave}
                />
            );

            expect(screen.getByRole('dialog')).toBeInTheDocument();
        });

        it('calls onClose when close button clicked', () => {
            render(
                <ConfigureNutrientsModal
                    isOpen={true}
                    nutrients={createMockNutrients()}
                    selectedIds={[]}
                    onClose={mockOnClose}
                    onSave={mockOnSave}
                />
            );

            const closeButton = screen.getByRole('button', { name: 'Закрыть' });
            fireEvent.click(closeButton);

            expect(mockOnClose).toHaveBeenCalledTimes(1);
        });

        it('calls onClose when backdrop clicked', () => {
            render(
                <ConfigureNutrientsModal
                    isOpen={true}
                    nutrients={createMockNutrients()}
                    selectedIds={[]}
                    onClose={mockOnClose}
                    onSave={mockOnSave}
                />
            );

            const backdrop = screen.getByRole('dialog');
            fireEvent.click(backdrop);

            expect(mockOnClose).toHaveBeenCalledTimes(1);
        });

        it('does not close when clicking inside modal content', () => {
            render(
                <ConfigureNutrientsModal
                    isOpen={true}
                    nutrients={createMockNutrients()}
                    selectedIds={[]}
                    onClose={mockOnClose}
                    onSave={mockOnSave}
                />
            );

            // Click on the modal title (inside the modal)
            const title = screen.getByText('Настроить список');
            fireEvent.click(title);

            expect(mockOnClose).not.toHaveBeenCalled();
        });

        it('calls onClose when Escape key pressed', () => {
            render(
                <ConfigureNutrientsModal
                    isOpen={true}
                    nutrients={createMockNutrients()}
                    selectedIds={[]}
                    onClose={mockOnClose}
                    onSave={mockOnSave}
                />
            );

            fireEvent.keyDown(document, { key: 'Escape' });

            expect(mockOnClose).toHaveBeenCalledTimes(1);
        });

        it('calls onClose when cancel button clicked', () => {
            render(
                <ConfigureNutrientsModal
                    isOpen={true}
                    nutrients={createMockNutrients()}
                    selectedIds={[]}
                    onClose={mockOnClose}
                    onSave={mockOnSave}
                />
            );

            const cancelButton = screen.getByRole('button', { name: 'Отмена' });
            fireEvent.click(cancelButton);

            expect(mockOnClose).toHaveBeenCalledTimes(1);
        });
    });

    // ========================================================================
    // Russian Labels Tests
    // ========================================================================

    describe('Russian labels', () => {
        it('displays modal title in Russian', () => {
            render(
                <ConfigureNutrientsModal
                    isOpen={true}
                    nutrients={createMockNutrients()}
                    selectedIds={[]}
                    onClose={mockOnClose}
                    onSave={mockOnSave}
                />
            );

            expect(screen.getByText('Настроить список')).toBeInTheDocument();
        });

        it('displays category labels in Russian', () => {
            render(
                <ConfigureNutrientsModal
                    isOpen={true}
                    nutrients={createMockNutrients()}
                    selectedIds={[]}
                    onClose={mockOnClose}
                    onSave={mockOnSave}
                />
            );

            expect(screen.getByText('Витамины')).toBeInTheDocument();
            expect(screen.getByText('Минералы')).toBeInTheDocument();
            expect(screen.getByText('Липиды')).toBeInTheDocument();
        });

        it('displays save button in Russian', () => {
            render(
                <ConfigureNutrientsModal
                    isOpen={true}
                    nutrients={createMockNutrients()}
                    selectedIds={[]}
                    onClose={mockOnClose}
                    onSave={mockOnSave}
                />
            );

            expect(screen.getByRole('button', { name: /сохранить/i })).toBeInTheDocument();
        });

        it('displays cancel button in Russian', () => {
            render(
                <ConfigureNutrientsModal
                    isOpen={true}
                    nutrients={createMockNutrients()}
                    selectedIds={[]}
                    onClose={mockOnClose}
                    onSave={mockOnSave}
                />
            );

            expect(screen.getByRole('button', { name: 'Отмена' })).toBeInTheDocument();
        });

        it('displays selection count in Russian', () => {
            render(
                <ConfigureNutrientsModal
                    isOpen={true}
                    nutrients={createMockNutrients()}
                    selectedIds={['vitamin-c', 'iron']}
                    onClose={mockOnClose}
                    onSave={mockOnSave}
                />
            );

            expect(screen.getByText(/выбрано: 2 из 6/i)).toBeInTheDocument();
        });
    });

    // ========================================================================
    // Checkbox Toggling Tests
    // ========================================================================

    describe('checkbox toggling', () => {
        it('renders checkboxes for all nutrients', () => {
            render(
                <ConfigureNutrientsModal
                    isOpen={true}
                    nutrients={createMockNutrients()}
                    selectedIds={[]}
                    onClose={mockOnClose}
                    onSave={mockOnSave}
                />
            );

            // Expand all categories first
            fireEvent.click(screen.getByText('Минералы'));
            fireEvent.click(screen.getByText('Липиды'));

            const checkboxes = screen.getAllByRole('checkbox');
            expect(checkboxes.length).toBe(6);
        });

        it('shows selected nutrients as checked', () => {
            render(
                <ConfigureNutrientsModal
                    isOpen={true}
                    nutrients={createMockNutrients()}
                    selectedIds={['vitamin-c', 'vitamin-d']}
                    onClose={mockOnClose}
                    onSave={mockOnSave}
                />
            );

            const vitaminCCheckbox = screen.getByRole('checkbox', { name: /витамин c/i });
            const vitaminDCheckbox = screen.getByRole('checkbox', { name: /витамин d/i });

            expect(vitaminCCheckbox).toBeChecked();
            expect(vitaminDCheckbox).toBeChecked();
        });

        it('toggles checkbox when clicked', () => {
            render(
                <ConfigureNutrientsModal
                    isOpen={true}
                    nutrients={createMockNutrients()}
                    selectedIds={[]}
                    onClose={mockOnClose}
                    onSave={mockOnSave}
                />
            );

            const vitaminCCheckbox = screen.getByRole('checkbox', { name: /витамин c/i });
            expect(vitaminCCheckbox).not.toBeChecked();

            fireEvent.click(vitaminCCheckbox);
            expect(vitaminCCheckbox).toBeChecked();

            fireEvent.click(vitaminCCheckbox);
            expect(vitaminCCheckbox).not.toBeChecked();
        });

        it('updates selection count when checkbox toggled', () => {
            render(
                <ConfigureNutrientsModal
                    isOpen={true}
                    nutrients={createMockNutrients()}
                    selectedIds={[]}
                    onClose={mockOnClose}
                    onSave={mockOnSave}
                />
            );

            expect(screen.getByText(/выбрано: 0 из 6/i)).toBeInTheDocument();

            const vitaminCCheckbox = screen.getByRole('checkbox', { name: /витамин c/i });
            fireEvent.click(vitaminCCheckbox);

            expect(screen.getByText(/выбрано: 1 из 6/i)).toBeInTheDocument();
        });
    });

    // ========================================================================
    // Select All / Deselect All Tests
    // ========================================================================

    describe('select all / deselect all', () => {
        it('displays "Выбрать все" button for each category', () => {
            render(
                <ConfigureNutrientsModal
                    isOpen={true}
                    nutrients={createMockNutrients()}
                    selectedIds={[]}
                    onClose={mockOnClose}
                    onSave={mockOnSave}
                />
            );

            // Vitamins category is expanded by default
            expect(screen.getByRole('button', { name: /выбрать все витамины/i })).toBeInTheDocument();
        });

        it('displays "Снять выбор" button for each category', () => {
            render(
                <ConfigureNutrientsModal
                    isOpen={true}
                    nutrients={createMockNutrients()}
                    selectedIds={['vitamin-c']}
                    onClose={mockOnClose}
                    onSave={mockOnSave}
                />
            );

            expect(screen.getByRole('button', { name: /снять выбор витамины/i })).toBeInTheDocument();
        });

        it('selects all nutrients in category when "Выбрать все" clicked', () => {
            render(
                <ConfigureNutrientsModal
                    isOpen={true}
                    nutrients={createMockNutrients()}
                    selectedIds={[]}
                    onClose={mockOnClose}
                    onSave={mockOnSave}
                />
            );

            const selectAllButton = screen.getByRole('button', { name: /выбрать все витамины/i });
            fireEvent.click(selectAllButton);

            // All vitamin checkboxes should be checked
            const vitaminCCheckbox = screen.getByRole('checkbox', { name: /витамин c/i });
            const vitaminDCheckbox = screen.getByRole('checkbox', { name: /витамин d/i });
            const vitaminB12Checkbox = screen.getByRole('checkbox', { name: /витамин b12/i });

            expect(vitaminCCheckbox).toBeChecked();
            expect(vitaminDCheckbox).toBeChecked();
            expect(vitaminB12Checkbox).toBeChecked();
        });

        it('deselects all nutrients in category when "Снять выбор" clicked', () => {
            render(
                <ConfigureNutrientsModal
                    isOpen={true}
                    nutrients={createMockNutrients()}
                    selectedIds={['vitamin-c', 'vitamin-d', 'vitamin-b12']}
                    onClose={mockOnClose}
                    onSave={mockOnSave}
                />
            );

            const deselectAllButton = screen.getByRole('button', { name: /снять выбор витамины/i });
            fireEvent.click(deselectAllButton);

            // All vitamin checkboxes should be unchecked
            const vitaminCCheckbox = screen.getByRole('checkbox', { name: /витамин c/i });
            const vitaminDCheckbox = screen.getByRole('checkbox', { name: /витамин d/i });
            const vitaminB12Checkbox = screen.getByRole('checkbox', { name: /витамин b12/i });

            expect(vitaminCCheckbox).not.toBeChecked();
            expect(vitaminDCheckbox).not.toBeChecked();
            expect(vitaminB12Checkbox).not.toBeChecked();
        });

        it('disables "Выбрать все" when all selected', () => {
            render(
                <ConfigureNutrientsModal
                    isOpen={true}
                    nutrients={createMockNutrients()}
                    selectedIds={['vitamin-c', 'vitamin-d', 'vitamin-b12']}
                    onClose={mockOnClose}
                    onSave={mockOnSave}
                />
            );

            const selectAllButton = screen.getByRole('button', { name: /выбрать все витамины/i });
            expect(selectAllButton).toBeDisabled();
        });

        it('disables "Снять выбор" when none selected', () => {
            render(
                <ConfigureNutrientsModal
                    isOpen={true}
                    nutrients={createMockNutrients()}
                    selectedIds={[]}
                    onClose={mockOnClose}
                    onSave={mockOnSave}
                />
            );

            const deselectAllButton = screen.getByRole('button', { name: /снять выбор витамины/i });
            expect(deselectAllButton).toBeDisabled();
        });
    });

    // ========================================================================
    // Save Functionality Tests
    // ========================================================================

    describe('save functionality', () => {
        it('calls onSave with selected IDs when save clicked', () => {
            render(
                <ConfigureNutrientsModal
                    isOpen={true}
                    nutrients={createMockNutrients()}
                    selectedIds={['vitamin-c']}
                    onClose={mockOnClose}
                    onSave={mockOnSave}
                />
            );

            // Select another nutrient
            const vitaminDCheckbox = screen.getByRole('checkbox', { name: /витамин d/i });
            fireEvent.click(vitaminDCheckbox);

            // Click save
            const saveButton = screen.getByRole('button', { name: /сохранить/i });
            fireEvent.click(saveButton);

            expect(mockOnSave).toHaveBeenCalledTimes(1);
            expect(mockOnSave).toHaveBeenCalledWith(
                expect.arrayContaining(['vitamin-c', 'vitamin-d'])
            );
        });

        it('calls onClose after save', () => {
            render(
                <ConfigureNutrientsModal
                    isOpen={true}
                    nutrients={createMockNutrients()}
                    selectedIds={['vitamin-c']}
                    onClose={mockOnClose}
                    onSave={mockOnSave}
                />
            );

            const saveButton = screen.getByRole('button', { name: /сохранить/i });
            fireEvent.click(saveButton);

            expect(mockOnClose).toHaveBeenCalledTimes(1);
        });

        it('saves empty array when nothing selected', () => {
            render(
                <ConfigureNutrientsModal
                    isOpen={true}
                    nutrients={createMockNutrients()}
                    selectedIds={[]}
                    onClose={mockOnClose}
                    onSave={mockOnSave}
                />
            );

            const saveButton = screen.getByRole('button', { name: /сохранить/i });
            fireEvent.click(saveButton);

            expect(mockOnSave).toHaveBeenCalledWith([]);
        });
    });

    // ========================================================================
    // Category Expansion Tests
    // ========================================================================

    describe('category expansion', () => {
        it('expands vitamins category by default', () => {
            render(
                <ConfigureNutrientsModal
                    isOpen={true}
                    nutrients={createMockNutrients()}
                    selectedIds={[]}
                    onClose={mockOnClose}
                    onSave={mockOnSave}
                />
            );

            // Vitamins should be expanded - checkboxes visible
            expect(screen.getByRole('checkbox', { name: /витамин c/i })).toBeInTheDocument();
        });

        it('toggles category expansion when header clicked', () => {
            render(
                <ConfigureNutrientsModal
                    isOpen={true}
                    nutrients={createMockNutrients()}
                    selectedIds={[]}
                    onClose={mockOnClose}
                    onSave={mockOnSave}
                />
            );

            // Minerals should be collapsed initially
            expect(screen.queryByRole('checkbox', { name: /железо/i })).not.toBeInTheDocument();

            // Click to expand
            fireEvent.click(screen.getByText('Минералы'));

            // Now minerals should be visible
            expect(screen.getByRole('checkbox', { name: /железо/i })).toBeInTheDocument();
        });

        it('collapses expanded category when header clicked again', () => {
            render(
                <ConfigureNutrientsModal
                    isOpen={true}
                    nutrients={createMockNutrients()}
                    selectedIds={[]}
                    onClose={mockOnClose}
                    onSave={mockOnSave}
                />
            );

            // Vitamins should be expanded by default
            expect(screen.getByRole('checkbox', { name: /витамин c/i })).toBeInTheDocument();

            // Click to collapse
            fireEvent.click(screen.getByText('Витамины'));

            // Now vitamins checkboxes should be hidden
            expect(screen.queryByRole('checkbox', { name: /витамин c/i })).not.toBeInTheDocument();
        });

        it('displays category count correctly', () => {
            render(
                <ConfigureNutrientsModal
                    isOpen={true}
                    nutrients={createMockNutrients()}
                    selectedIds={['vitamin-c', 'vitamin-d']}
                    onClose={mockOnClose}
                    onSave={mockOnSave}
                />
            );

            // Vitamins: 2 selected out of 3
            expect(screen.getByText('(2 / 3)')).toBeInTheDocument();
        });
    });

    // ========================================================================
    // Accessibility Tests
    // ========================================================================

    describe('accessibility', () => {
        it('has correct aria-modal attribute', () => {
            render(
                <ConfigureNutrientsModal
                    isOpen={true}
                    nutrients={createMockNutrients()}
                    selectedIds={[]}
                    onClose={mockOnClose}
                    onSave={mockOnSave}
                />
            );

            expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
        });

        it('has correct aria-labelledby attribute', () => {
            render(
                <ConfigureNutrientsModal
                    isOpen={true}
                    nutrients={createMockNutrients()}
                    selectedIds={[]}
                    onClose={mockOnClose}
                    onSave={mockOnSave}
                />
            );

            expect(screen.getByRole('dialog')).toHaveAttribute(
                'aria-labelledby',
                'configure-nutrients-title'
            );
        });

        it('category buttons have aria-expanded attribute', () => {
            render(
                <ConfigureNutrientsModal
                    isOpen={true}
                    nutrients={createMockNutrients()}
                    selectedIds={[]}
                    onClose={mockOnClose}
                    onSave={mockOnSave}
                />
            );

            // Use aria-controls to find the specific category header buttons
            const vitaminsButton = screen.getByRole('button', { name: /витамины.*\(0 \/ 3\)/i });
            expect(vitaminsButton).toHaveAttribute('aria-expanded', 'true');

            const mineralsButton = screen.getByRole('button', { name: /минералы.*\(0 \/ 2\)/i });
            expect(mineralsButton).toHaveAttribute('aria-expanded', 'false');
        });
    });

    // ========================================================================
    // State Reset Tests
    // ========================================================================

    describe('state reset', () => {
        it('resets to initial selection when modal reopens', async () => {
            const { rerender } = render(
                <ConfigureNutrientsModal
                    isOpen={true}
                    nutrients={createMockNutrients()}
                    selectedIds={['vitamin-c']}
                    onClose={mockOnClose}
                    onSave={mockOnSave}
                />
            );

            // Select another nutrient
            const vitaminDCheckbox = screen.getByRole('checkbox', { name: /витамин d/i });
            fireEvent.click(vitaminDCheckbox);
            expect(vitaminDCheckbox).toBeChecked();

            // Close modal
            rerender(
                <ConfigureNutrientsModal
                    isOpen={false}
                    nutrients={createMockNutrients()}
                    selectedIds={['vitamin-c']}
                    onClose={mockOnClose}
                    onSave={mockOnSave}
                />
            );

            // Reopen modal
            rerender(
                <ConfigureNutrientsModal
                    isOpen={true}
                    nutrients={createMockNutrients()}
                    selectedIds={['vitamin-c']}
                    onClose={mockOnClose}
                    onSave={mockOnSave}
                />
            );

            // Vitamin D should be unchecked again (reset to initial) - wait for async reset via setTimeout
            await waitFor(() => {
                const vitaminDCheckboxAfter = screen.getByRole('checkbox', { name: /витамин d/i });
                expect(vitaminDCheckboxAfter).not.toBeChecked();
            });
        });
    });

    // ========================================================================
    // Edge Cases Tests
    // ========================================================================

    describe('edge cases', () => {
        it('handles empty nutrients list', () => {
            render(
                <ConfigureNutrientsModal
                    isOpen={true}
                    nutrients={[]}
                    selectedIds={[]}
                    onClose={mockOnClose}
                    onSave={mockOnSave}
                />
            );

            expect(screen.getByText('Настроить список')).toBeInTheDocument();
            expect(screen.getByText(/выбрано: 0 из 0/i)).toBeInTheDocument();
        });

        it('handles nutrients with unknown category gracefully', () => {
            const nutrientsWithUnknownCategory = [
                ...createMockNutrients(),
                {
                    id: 'unknown-nutrient',
                    name: 'Неизвестный нутриент',
                    category: 'unknown' as any,
                    dailyTarget: 10,
                    unit: 'мг',
                    isWeekly: false,
                    isCustom: false,
                },
            ];

            render(
                <ConfigureNutrientsModal
                    isOpen={true}
                    nutrients={nutrientsWithUnknownCategory}
                    selectedIds={[]}
                    onClose={mockOnClose}
                    onSave={mockOnSave}
                />
            );

            // Should render without crashing
            expect(screen.getByText('Настроить список')).toBeInTheDocument();
            // Unknown category nutrient should not be displayed
            expect(screen.queryByText('Неизвестный нутриент')).not.toBeInTheDocument();
        });

        it('applies custom className', () => {
            render(
                <ConfigureNutrientsModal
                    isOpen={true}
                    nutrients={createMockNutrients()}
                    selectedIds={[]}
                    onClose={mockOnClose}
                    onSave={mockOnSave}
                    className="custom-class"
                />
            );

            const dialog = screen.getByRole('dialog');
            expect(dialog).toHaveClass('custom-class');
        });
    });

});
