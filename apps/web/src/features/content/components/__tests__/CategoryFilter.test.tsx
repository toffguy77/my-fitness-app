import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { CategoryFilter } from '../CategoryFilter';
import { CATEGORY_LABELS } from '@/features/content/types';

describe('CategoryFilter', () => {
    const mockOnSelect = jest.fn();

    beforeEach(() => {
        mockOnSelect.mockClear();
    });

    it('renders "Все" chip and all category chips', () => {
        render(<CategoryFilter selected={null} onSelect={mockOnSelect} />);

        expect(screen.getByText('Все')).toBeInTheDocument();

        for (const label of Object.values(CATEGORY_LABELS)) {
            expect(screen.getByText(label)).toBeInTheDocument();
        }
    });

    it('renders correct number of buttons', () => {
        render(<CategoryFilter selected={null} onSelect={mockOnSelect} />);

        const buttons = screen.getAllByRole('button');
        // "Все" + 6 categories
        expect(buttons).toHaveLength(1 + Object.keys(CATEGORY_LABELS).length);
    });

    it('"Все" is active when selected is null', () => {
        render(<CategoryFilter selected={null} onSelect={mockOnSelect} />);

        const allButton = screen.getByText('Все');
        expect(allButton.className).toContain('bg-fg');
        expect(allButton.className).toContain('text-fg-inverse');
    });

    it('category chips are inactive when selected is null', () => {
        render(<CategoryFilter selected={null} onSelect={mockOnSelect} />);

        const nutritionButton = screen.getByText('Питание');
        expect(nutritionButton.className).toContain('border');
        expect(nutritionButton.className).not.toContain('bg-fg');
    });

    it('active category chip has active style', () => {
        render(<CategoryFilter selected="nutrition" onSelect={mockOnSelect} />);

        const nutritionButton = screen.getByText('Питание');
        expect(nutritionButton.className).toContain('bg-fg');
        expect(nutritionButton.className).toContain('text-fg-inverse');

        // "Все" should be inactive
        const allButton = screen.getByText('Все');
        expect(allButton.className).not.toContain('bg-fg');
    });

    it('clicking a category calls onSelect with category value', () => {
        render(<CategoryFilter selected={null} onSelect={mockOnSelect} />);

        fireEvent.click(screen.getByText('Тренировки'));
        expect(mockOnSelect).toHaveBeenCalledWith('training');
    });

    it('clicking "Все" calls onSelect with null', () => {
        render(<CategoryFilter selected="nutrition" onSelect={mockOnSelect} />);

        fireEvent.click(screen.getByText('Все'));
        expect(mockOnSelect).toHaveBeenCalledWith(null);
    });
});
