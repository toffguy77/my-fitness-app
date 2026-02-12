/**
 * FoodEntryModal Unit Tests
 *
 * Tests for food entry modal display and interactions.
 *
 * @module food-tracker/components/__tests__/FoodEntryModal.test
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FoodEntryModal } from '../FoodEntryModal';

// ============================================================================
// Display Tests
// ============================================================================

describe('FoodEntryModal', () => {
    describe('Rendering', () => {
        it('renders nothing when isOpen is false', () => {
            render(<FoodEntryModal isOpen={false} onClose={jest.fn()} />);

            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });

        it('renders modal when isOpen is true', () => {
            render(<FoodEntryModal isOpen={true} onClose={jest.fn()} />);

            expect(screen.getByRole('dialog')).toBeInTheDocument();
        });

        it('displays modal title "Добавить запись"', () => {
            render(<FoodEntryModal isOpen={true} onClose={jest.fn()} />);

            expect(screen.getByText('Добавить запись')).toBeInTheDocument();
        });

        it('displays close button with Russian aria-label', () => {
            render(<FoodEntryModal isOpen={true} onClose={jest.fn()} />);

            expect(screen.getByRole('button', { name: 'Закрыть' })).toBeInTheDocument();
        });
    });

    describe('Tab Rendering', () => {
        it('renders all four tabs with Russian labels', () => {
            render(<FoodEntryModal isOpen={true} onClose={jest.fn()} />);

            expect(screen.getByRole('tab', { name: 'Поиск' })).toBeInTheDocument();
            expect(screen.getByRole('tab', { name: 'Штрих-код' })).toBeInTheDocument();
            expect(screen.getByRole('tab', { name: 'Фото еды' })).toBeInTheDocument();
            expect(screen.getByRole('tab', { name: 'Чат' })).toBeInTheDocument();
        });

        it('defaults to "Поиск" tab selected', () => {
            render(<FoodEntryModal isOpen={true} onClose={jest.fn()} />);

            const searchTab = screen.getByRole('tab', { name: 'Поиск' });
            expect(searchTab).toHaveAttribute('aria-selected', 'true');
        });

        it('renders tablist with Russian aria-label', () => {
            render(<FoodEntryModal isOpen={true} onClose={jest.fn()} />);

            expect(screen.getByRole('tablist', { name: 'Способы добавления' })).toBeInTheDocument();
        });
    });

    describe('Tab Switching', () => {
        it('switches to barcode tab when clicked', async () => {
            const user = userEvent.setup();
            render(<FoodEntryModal isOpen={true} onClose={jest.fn()} />);

            await user.click(screen.getByRole('tab', { name: 'Штрих-код' }));

            expect(screen.getByRole('tab', { name: 'Штрих-код' })).toHaveAttribute('aria-selected', 'true');
            expect(screen.getByRole('tab', { name: 'Поиск' })).toHaveAttribute('aria-selected', 'false');
        });

        it('switches to photo tab when clicked', async () => {
            const user = userEvent.setup();
            render(<FoodEntryModal isOpen={true} onClose={jest.fn()} />);

            await user.click(screen.getByRole('tab', { name: 'Фото еды' }));

            expect(screen.getByRole('tab', { name: 'Фото еды' })).toHaveAttribute('aria-selected', 'true');
        });

        it('switches to chat tab when clicked', async () => {
            const user = userEvent.setup();
            render(<FoodEntryModal isOpen={true} onClose={jest.fn()} />);

            await user.click(screen.getByRole('tab', { name: 'Чат' }));

            expect(screen.getByRole('tab', { name: 'Чат' })).toHaveAttribute('aria-selected', 'true');
        });

        it('displays corresponding tab panel content', async () => {
            const user = userEvent.setup();
            render(<FoodEntryModal isOpen={true} onClose={jest.fn()} />);

            // Default search tab content
            expect(screen.getByText('Поиск продуктов')).toBeInTheDocument();

            // Switch to barcode
            await user.click(screen.getByRole('tab', { name: 'Штрих-код' }));
            expect(screen.getByText('Сканирование штрих-кода')).toBeInTheDocument();

            // Switch to photo
            await user.click(screen.getByRole('tab', { name: 'Фото еды' }));
            expect(screen.getByText('Распознавание по фото')).toBeInTheDocument();

            // Switch to chat
            await user.click(screen.getByRole('tab', { name: 'Чат' }));
            expect(screen.getByText('Чат с куратором')).toBeInTheDocument();
        });
    });

    describe('Close Behavior', () => {
        it('calls onClose when close button is clicked', async () => {
            const user = userEvent.setup();
            const onClose = jest.fn();
            render(<FoodEntryModal isOpen={true} onClose={onClose} />);

            await user.click(screen.getByRole('button', { name: 'Закрыть' }));

            expect(onClose).toHaveBeenCalledTimes(1);
        });

        it('calls onClose when Escape key is pressed', () => {
            const onClose = jest.fn();
            render(<FoodEntryModal isOpen={true} onClose={onClose} />);

            fireEvent.keyDown(document, { key: 'Escape' });

            expect(onClose).toHaveBeenCalledTimes(1);
        });

        it('calls onClose when clicking outside modal (backdrop)', () => {
            const onClose = jest.fn();
            render(<FoodEntryModal isOpen={true} onClose={onClose} />);

            // Click on the backdrop (dialog element)
            const dialog = screen.getByRole('dialog');
            fireEvent.click(dialog);

            expect(onClose).toHaveBeenCalledTimes(1);
        });

        it('does not call onClose when clicking inside modal', async () => {
            const user = userEvent.setup();
            const onClose = jest.fn();
            render(<FoodEntryModal isOpen={true} onClose={onClose} />);

            // Click on modal content (title)
            await user.click(screen.getByText('Добавить запись'));

            expect(onClose).not.toHaveBeenCalled();
        });
    });

    describe('Keyboard Navigation', () => {
        it('supports arrow right to navigate tabs', () => {
            render(<FoodEntryModal isOpen={true} onClose={jest.fn()} />);

            // Focus on search tab and press arrow right
            const searchTab = screen.getByRole('tab', { name: 'Поиск' });
            fireEvent.keyDown(searchTab, { key: 'ArrowRight' });

            // Barcode tab should be selected
            expect(screen.getByRole('tab', { name: 'Штрих-код' })).toHaveAttribute('aria-selected', 'true');
        });

        it('supports arrow left to navigate tabs', async () => {
            const user = userEvent.setup();
            render(<FoodEntryModal isOpen={true} onClose={jest.fn()} />);

            // First switch to barcode tab
            await user.click(screen.getByRole('tab', { name: 'Штрих-код' }));

            // Focus on barcode tab
            const barcodeTab = screen.getByRole('tab', { name: 'Штрих-код' });
            barcodeTab.focus();

            // Press arrow left
            await user.keyboard('{ArrowLeft}');

            // Search tab should be selected
            expect(screen.getByRole('tab', { name: 'Поиск' })).toHaveAttribute('aria-selected', 'true');
        });

        it('wraps around when pressing arrow right on last tab', async () => {
            const user = userEvent.setup();
            render(<FoodEntryModal isOpen={true} onClose={jest.fn()} />);

            // Switch to chat tab (last)
            await user.click(screen.getByRole('tab', { name: 'Чат' }));

            // Focus on chat tab
            const chatTab = screen.getByRole('tab', { name: 'Чат' });
            chatTab.focus();

            // Press arrow right
            await user.keyboard('{ArrowRight}');

            // Should wrap to search tab
            expect(screen.getByRole('tab', { name: 'Поиск' })).toHaveAttribute('aria-selected', 'true');
        });

        it('wraps around when pressing arrow left on first tab', () => {
            render(<FoodEntryModal isOpen={true} onClose={jest.fn()} />);

            // Focus on search tab (first) and press arrow left
            const searchTab = screen.getByRole('tab', { name: 'Поиск' });
            fireEvent.keyDown(searchTab, { key: 'ArrowLeft' });

            // Should wrap to chat tab
            expect(screen.getByRole('tab', { name: 'Чат' })).toHaveAttribute('aria-selected', 'true');
        });

        it('supports Home key to go to first tab', async () => {
            const user = userEvent.setup();
            render(<FoodEntryModal isOpen={true} onClose={jest.fn()} />);

            // Switch to chat tab
            await user.click(screen.getByRole('tab', { name: 'Чат' }));

            // Focus on chat tab
            const chatTab = screen.getByRole('tab', { name: 'Чат' });
            chatTab.focus();

            // Press Home
            await user.keyboard('{Home}');

            // Should go to search tab
            expect(screen.getByRole('tab', { name: 'Поиск' })).toHaveAttribute('aria-selected', 'true');
        });

        it('supports End key to go to last tab', () => {
            render(<FoodEntryModal isOpen={true} onClose={jest.fn()} />);

            // Focus on search tab and press End
            const searchTab = screen.getByRole('tab', { name: 'Поиск' });
            fireEvent.keyDown(searchTab, { key: 'End' });

            // Should go to chat tab
            expect(screen.getByRole('tab', { name: 'Чат' })).toHaveAttribute('aria-selected', 'true');
        });
    });

    describe('Meal Type Display', () => {
        it('displays meal type when provided', () => {
            render(<FoodEntryModal isOpen={true} onClose={jest.fn()} mealType="breakfast" />);

            expect(screen.getByText(/Приём пищи: Завтрак/)).toBeInTheDocument();
        });

        it('displays correct Russian label for lunch', () => {
            render(<FoodEntryModal isOpen={true} onClose={jest.fn()} mealType="lunch" />);

            expect(screen.getByText(/Приём пищи: Обед/)).toBeInTheDocument();
        });

        it('displays correct Russian label for dinner', () => {
            render(<FoodEntryModal isOpen={true} onClose={jest.fn()} mealType="dinner" />);

            expect(screen.getByText(/Приём пищи: Ужин/)).toBeInTheDocument();
        });

        it('displays correct Russian label for snack', () => {
            render(<FoodEntryModal isOpen={true} onClose={jest.fn()} mealType="snack" />);

            expect(screen.getByText(/Приём пищи: Перекус/)).toBeInTheDocument();
        });

        it('does not display meal type when not provided', () => {
            render(<FoodEntryModal isOpen={true} onClose={jest.fn()} />);

            expect(screen.queryByText(/Приём пищи:/)).not.toBeInTheDocument();
        });
    });

    describe('Accessibility', () => {
        it('has aria-modal attribute', () => {
            render(<FoodEntryModal isOpen={true} onClose={jest.fn()} />);

            expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
        });

        it('has aria-labelledby pointing to title', () => {
            render(<FoodEntryModal isOpen={true} onClose={jest.fn()} />);

            const dialog = screen.getByRole('dialog');
            expect(dialog).toHaveAttribute('aria-labelledby', 'food-entry-modal-title');

            const title = screen.getByText('Добавить запись');
            expect(title).toHaveAttribute('id', 'food-entry-modal-title');
        });

        it('tabs have correct aria-controls', () => {
            render(<FoodEntryModal isOpen={true} onClose={jest.fn()} />);

            const searchTab = screen.getByRole('tab', { name: 'Поиск' });
            expect(searchTab).toHaveAttribute('aria-controls', 'tabpanel-search');
        });

        it('tab panels have correct aria-labelledby', () => {
            render(<FoodEntryModal isOpen={true} onClose={jest.fn()} />);

            const searchPanel = screen.getByRole('tabpanel');
            expect(searchPanel).toHaveAttribute('aria-labelledby', 'tab-search');
        });

        it('inactive tabs have tabIndex -1', () => {
            render(<FoodEntryModal isOpen={true} onClose={jest.fn()} />);

            const barcodeTab = screen.getByRole('tab', { name: 'Штрих-код' });
            expect(barcodeTab).toHaveAttribute('tabIndex', '-1');
        });

        it('active tab has tabIndex 0', () => {
            render(<FoodEntryModal isOpen={true} onClose={jest.fn()} />);

            const searchTab = screen.getByRole('tab', { name: 'Поиск' });
            expect(searchTab).toHaveAttribute('tabIndex', '0');
        });
    });

    describe('Modal Reset', () => {
        it('resets to default tab when reopened', () => {
            const { rerender } = render(<FoodEntryModal isOpen={true} onClose={jest.fn()} />);

            // Switch to chat tab
            fireEvent.click(screen.getByRole('tab', { name: 'Чат' }));
            expect(screen.getByRole('tab', { name: 'Чат' })).toHaveAttribute('aria-selected', 'true');

            // Close modal
            rerender(<FoodEntryModal isOpen={false} onClose={jest.fn()} />);

            // Reopen modal
            rerender(<FoodEntryModal isOpen={true} onClose={jest.fn()} />);

            // Should be back to search tab
            expect(screen.getByRole('tab', { name: 'Поиск' })).toHaveAttribute('aria-selected', 'true');
        });
    });

    describe('Styling', () => {
        it('applies custom className', () => {
            render(
                <FoodEntryModal
                    isOpen={true}
                    onClose={jest.fn()}
                    className="custom-class"
                />
            );

            const dialog = screen.getByRole('dialog');
            expect(dialog).toHaveClass('custom-class');
        });

        it('has focus-visible styles on close button', () => {
            render(<FoodEntryModal isOpen={true} onClose={jest.fn()} />);

            const closeButton = screen.getByRole('button', { name: 'Закрыть' });
            expect(closeButton).toHaveClass('focus-visible:ring-2');
        });

        it('has focus-visible styles on tabs', () => {
            render(<FoodEntryModal isOpen={true} onClose={jest.fn()} />);

            const searchTab = screen.getByRole('tab', { name: 'Поиск' });
            expect(searchTab).toHaveClass('focus-visible:ring-2');
        });
    });
});
