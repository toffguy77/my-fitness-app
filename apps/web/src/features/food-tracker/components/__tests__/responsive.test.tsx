/**
 * Responsive Design Tests
 *
 * Tests for responsive breakpoints and mobile/tablet/desktop layouts.
 *
 * @module food-tracker/components/__tests__/responsive
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { KBZHUSummary } from '../KBZHUSummary';
import { MealSlot } from '../MealSlot';
import { WaterTracker } from '../WaterTracker';
import { DatePicker } from '../DatePicker';
import { FoodTrackerTabs } from '../FoodTrackerTabs';
import type { KBZHU, FoodEntry, WaterLog, MealType, FoodTrackerTab } from '../../types';

// ============================================================================
// Test Data
// ============================================================================

const mockKBZHU: KBZHU = {
    calories: 1500,
    protein: 75,
    fat: 50,
    carbs: 200,
};

const mockTargetGoals: KBZHU = {
    calories: 2000,
    protein: 100,
    fat: 70,
    carbs: 250,
};

const mockFoodEntry: FoodEntry = {
    id: 'entry-1',
    foodId: 'food-1',
    foodName: 'Овсяная каша',
    mealType: 'breakfast',
    portionType: 'grams',
    portionAmount: 200,
    nutrition: {
        calories: 300,
        protein: 10,
        fat: 5,
        carbs: 50,
    },
    time: '08:30',
    date: '2024-01-15',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
};

const mockWaterLog: WaterLog = {
    date: '2024-01-15',
    glasses: 4,
    goal: 8,
    glassSize: 250,
};

// ============================================================================
// KBZHUSummary Responsive Tests
// ============================================================================

describe('KBZHUSummary Responsive Design', () => {
    it('renders with responsive padding classes', () => {
        const { container } = render(
            <KBZHUSummary current={mockKBZHU} target={mockTargetGoals} />
        );

        const section = container.querySelector('section');
        expect(section).toHaveClass('p-3', 'sm:p-4');
    });

    it('renders header with responsive text size', () => {
        render(<KBZHUSummary current={mockKBZHU} target={mockTargetGoals} />);

        const header = screen.getByText('Дневная норма');
        expect(header).toHaveClass('text-sm', 'sm:text-base');
    });

    it('renders macro grid with responsive columns', () => {
        const { container } = render(
            <KBZHUSummary current={mockKBZHU} target={mockTargetGoals} />
        );

        const grid = container.querySelector('.grid');
        expect(grid).toHaveClass('grid-cols-2', 'md:grid-cols-4');
    });

    it('renders progress bars with responsive height', () => {
        const { container } = render(
            <KBZHUSummary current={mockKBZHU} target={mockTargetGoals} />
        );

        const progressBars = container.querySelectorAll('[role="progressbar"]');
        progressBars.forEach((bar) => {
            expect(bar).toHaveClass('h-1.5', 'sm:h-2');
        });
    });

    it('renders all four macros with Russian labels', () => {
        render(<KBZHUSummary current={mockKBZHU} target={mockTargetGoals} />);

        expect(screen.getByText('Ккал')).toBeInTheDocument();
        expect(screen.getByText('Белки')).toBeInTheDocument();
        expect(screen.getByText('Жиры')).toBeInTheDocument();
        expect(screen.getByText('Углеводы')).toBeInTheDocument();
    });
});

// ============================================================================
// MealSlot Responsive Tests
// ============================================================================

describe('MealSlot Responsive Design', () => {
    const defaultProps = {
        mealType: 'breakfast' as MealType,
        entries: [mockFoodEntry],
        onAddEntry: jest.fn(),
    };

    it('renders with responsive header padding', () => {
        const { container } = render(<MealSlot {...defaultProps} />);

        const header = container.querySelector('.bg-gray-50');
        expect(header).toHaveClass('px-3', 'py-2.5', 'sm:px-4', 'sm:py-3');
    });

    it('renders add button with responsive size', () => {
        render(<MealSlot {...defaultProps} />);

        const addButton = screen.getByRole('button', { name: /добавить в завтрак/i });
        expect(addButton).toHaveClass('p-1.5', 'sm:p-2');
    });

    it('renders meal label with responsive text size', () => {
        render(<MealSlot {...defaultProps} />);

        const label = screen.getByText('Завтрак');
        expect(label).toHaveClass('text-xs', 'sm:text-sm');
    });

    it('renders food entry with responsive padding', () => {
        const { container } = render(<MealSlot {...defaultProps} />);

        const entryItem = container.querySelector('[role="button"]');
        expect(entryItem).toHaveClass('py-3', 'px-2');
    });

    it('renders empty state with responsive text', () => {
        render(<MealSlot {...defaultProps} entries={[]} />);

        const emptyText = screen.getByText('Нет записей');
        expect(emptyText).toHaveClass('text-xs', 'sm:text-sm');
    });

    it('renders subtotal with responsive text size', () => {
        const { container } = render(<MealSlot {...defaultProps} />);

        const subtotal = container.querySelector('.border-t');
        expect(subtotal).toHaveClass('text-[10px]', 'sm:text-xs');
    });
});

// ============================================================================
// WaterTracker Responsive Tests
// ============================================================================

describe('WaterTracker Responsive Design', () => {
    const defaultProps = {
        waterLog: mockWaterLog,
        onAddGlass: jest.fn(),
    };

    it('renders with responsive padding', () => {
        const { container } = render(<WaterTracker {...defaultProps} />);

        const section = container.querySelector('section');
        expect(section).toHaveClass('p-3', 'sm:p-4');
    });

    it('renders header with icon', () => {
        const { container } = render(<WaterTracker {...defaultProps} />);

        const icon = container.querySelector('svg');
        expect(icon).toBeTruthy();
    });

    it('renders progress bar', () => {
        const { container } = render(<WaterTracker {...defaultProps} />);

        const progressBar = container.querySelector('[role="progressbar"]');
        expect(progressBar).toBeTruthy();
    });

    it('renders add button', () => {
        render(<WaterTracker {...defaultProps} />);

        const addButton = screen.getByRole('button', { name: /добавить стакан воды/i });
        expect(addButton).toBeTruthy();
    });

    it('displays water count in Russian format', () => {
        render(<WaterTracker {...defaultProps} />);

        expect(screen.getByText('4 / 8 стаканов')).toBeInTheDocument();
    });
});

// ============================================================================
// DatePicker Responsive Tests
// ============================================================================

describe('DatePicker Responsive Design', () => {
    const defaultProps = {
        selectedDate: new Date('2024-01-15'),
        onDateChange: jest.fn(),
    };

    it('renders with responsive container padding', () => {
        const { container } = render(<DatePicker {...defaultProps} />);

        const dateContainer = container.querySelector('.bg-white');
        expect(dateContainer).toHaveClass('p-1.5', 'sm:p-2');
    });

    it('renders navigation buttons with responsive size', () => {
        render(<DatePicker {...defaultProps} />);

        const prevButton = screen.getByRole('button', { name: /предыдущий день/i });
        expect(prevButton).toHaveClass('p-1.5', 'sm:p-2');
    });

    it('renders date text with responsive size', () => {
        const { container } = render(<DatePicker {...defaultProps} />);

        const dateText = container.querySelector('.font-medium');
        expect(dateText).toHaveClass('text-sm', 'sm:text-base');
    });

    it('renders calendar icon with responsive size', () => {
        const { container } = render(<DatePicker {...defaultProps} />);

        const calendarIcon = container.querySelector('.text-gray-500');
        expect(calendarIcon).toHaveClass('w-4', 'h-4', 'sm:w-5', 'sm:h-5');
    });
});

// ============================================================================
// FoodTrackerTabs Responsive Tests
// ============================================================================

describe('FoodTrackerTabs Responsive Design', () => {
    const defaultProps = {
        activeTab: 'diet' as FoodTrackerTab,
        onTabChange: jest.fn(),
    };

    it('renders with responsive container padding', () => {
        const { container } = render(<FoodTrackerTabs {...defaultProps} />);

        const tabContainer = container.querySelector('.bg-gray-100');
        expect(tabContainer).toHaveClass('p-0.5', 'sm:p-1');
    });

    it('renders tabs with responsive padding', () => {
        render(<FoodTrackerTabs {...defaultProps} />);

        const dietTab = screen.getByRole('tab', { name: /рацион/i });
        expect(dietTab).toHaveClass('py-2', 'px-3', 'sm:py-2.5', 'sm:px-4');
    });

    it('renders tab text with responsive size', () => {
        render(<FoodTrackerTabs {...defaultProps} />);

        const dietTab = screen.getByRole('tab', { name: /рацион/i });
        expect(dietTab).toHaveClass('text-xs', 'sm:text-sm');
    });

    it('renders both tabs with Russian labels', () => {
        render(<FoodTrackerTabs {...defaultProps} />);

        expect(screen.getByText('Рацион')).toBeInTheDocument();
        expect(screen.getByText('Рекомендации')).toBeInTheDocument();
    });
});

// ============================================================================
// Touch Interaction Tests
// ============================================================================

describe('Touch Interaction Support', () => {
    it('MealSlot add button has touch-manipulation class', () => {
        render(
            <MealSlot
                mealType="breakfast"
                entries={[]}
                onAddEntry={jest.fn()}
            />
        );

        const addButton = screen.getByRole('button', { name: /добавить в завтрак/i });
        expect(addButton).toHaveClass('touch-manipulation');
    });

    it('WaterTracker add button has touch-manipulation class', () => {
        render(
            <WaterTracker
                waterLog={mockWaterLog}
                onAddGlass={jest.fn()}
            />
        );

        const addButton = screen.getByRole('button', { name: /добавить стакан воды/i });
        expect(addButton).toHaveClass('touch-manipulation');
    });

    it('DatePicker navigation buttons have touch-manipulation class', () => {
        render(
            <DatePicker
                selectedDate={new Date()}
                onDateChange={jest.fn()}
            />
        );

        const prevButton = screen.getByRole('button', { name: /предыдущий день/i });
        expect(prevButton).toHaveClass('touch-manipulation');
    });

    it('FoodTrackerTabs have touch-manipulation class', () => {
        render(
            <FoodTrackerTabs
                activeTab="diet"
                onTabChange={jest.fn()}
            />
        );

        const dietTab = screen.getByRole('tab', { name: /рацион/i });
        expect(dietTab).toHaveClass('touch-manipulation');
    });
});

// ============================================================================
// DatePicker Functionality Tests
// ============================================================================

describe('DatePicker Functionality', () => {
    const defaultProps = {
        selectedDate: new Date('2024-01-15'),
        onDateChange: jest.fn(),
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('navigates to previous day when clicking prev button', () => {
        const onDateChange = jest.fn();
        render(<DatePicker selectedDate={new Date('2024-01-15')} onDateChange={onDateChange} />);

        const prevButton = screen.getByRole('button', { name: /предыдущий день/i });
        fireEvent.click(prevButton);

        expect(onDateChange).toHaveBeenCalledWith(expect.any(Date));
        const calledDate = onDateChange.mock.calls[0][0];
        expect(calledDate.getDate()).toBe(14);
    });

    it('navigates to next day when clicking next button', () => {
        const onDateChange = jest.fn();
        // Use a date in the past so next day is not in the future
        render(
            <DatePicker
                selectedDate={new Date('2024-01-10')}
                onDateChange={onDateChange}
                preventFutureDates={false}
            />
        );

        const nextButton = screen.getByRole('button', { name: /следующий день/i });
        fireEvent.click(nextButton);

        expect(onDateChange).toHaveBeenCalledWith(expect.any(Date));
        const calledDate = onDateChange.mock.calls[0][0];
        expect(calledDate.getDate()).toBe(11);
    });

    it('disables next button when preventFutureDates is true and at today', () => {
        const today = new Date();
        render(<DatePicker selectedDate={today} onDateChange={jest.fn()} preventFutureDates={true} />);

        const nextButton = screen.getByRole('button', { name: /следующий день/i });
        expect(nextButton).toBeDisabled();
    });

    it('opens calendar when clicking date display', () => {
        render(<DatePicker {...defaultProps} />);

        const dateButton = screen.getByRole('button', { name: /открыть календарь/i });
        fireEvent.click(dateButton);

        expect(screen.getByText('Пн')).toBeInTheDocument();
        expect(screen.getByText('Вт')).toBeInTheDocument();
    });

    it('displays Russian month names in calendar', () => {
        render(<DatePicker {...defaultProps} />);

        const dateButton = screen.getByRole('button', { name: /открыть календарь/i });
        fireEvent.click(dateButton);

        // January in Russian (genitive case, capitalized)
        expect(screen.getByText(/Января 2024/i)).toBeInTheDocument();
    });

    it('navigates calendar months with prev/next buttons', () => {
        render(<DatePicker {...defaultProps} />);

        // Open calendar
        fireEvent.click(screen.getByRole('button', { name: /открыть календарь/i }));

        // Navigate to previous month
        const prevMonthButton = screen.getByRole('button', { name: /предыдущий месяц/i });
        fireEvent.click(prevMonthButton);

        // Should show December
        expect(screen.getByText(/Декабря 2023/i)).toBeInTheDocument();
    });

    it('selects date from calendar', () => {
        const onDateChange = jest.fn();
        render(<DatePicker selectedDate={new Date('2024-01-15')} onDateChange={onDateChange} />);

        // Open calendar
        fireEvent.click(screen.getByRole('button', { name: /открыть календарь/i }));

        // Click on day 10
        const day10Button = screen.getByRole('button', { name: /10 января/i });
        fireEvent.click(day10Button);

        expect(onDateChange).toHaveBeenCalled();
    });

    it('shows "Сегодня" button when not on today', () => {
        render(<DatePicker {...defaultProps} />);

        // Open calendar
        fireEvent.click(screen.getByRole('button', { name: /открыть календарь/i }));

        expect(screen.getByText('Сегодня')).toBeInTheDocument();
    });

    it('formats date in Russian with "Сегодня" prefix for today', () => {
        const today = new Date();
        render(<DatePicker selectedDate={today} onDateChange={jest.fn()} />);

        expect(screen.getByText(/Сегодня,/)).toBeInTheDocument();
    });

    it('closes calendar after selecting a date', () => {
        const onDateChange = jest.fn();
        render(<DatePicker selectedDate={new Date('2024-01-15')} onDateChange={onDateChange} />);

        // Open calendar
        fireEvent.click(screen.getByRole('button', { name: /открыть календарь/i }));
        expect(screen.getByText('Пн')).toBeInTheDocument();

        // Select a date
        fireEvent.click(screen.getByRole('button', { name: /10 января/i }));

        // Calendar should be closed
        expect(screen.queryByText('Пн')).not.toBeInTheDocument();
    });

    it('navigates to next month in calendar', () => {
        render(<DatePicker {...defaultProps} />);

        // Open calendar
        fireEvent.click(screen.getByRole('button', { name: /открыть календарь/i }));

        // Navigate to next month
        const nextMonthButton = screen.getByRole('button', { name: /следующий месяц/i });
        fireEvent.click(nextMonthButton);

        // Should show February
        expect(screen.getByText(/Февраля 2024/i)).toBeInTheDocument();
    });

    it('goes to today when clicking "Сегодня" button', () => {
        const onDateChange = jest.fn();
        render(<DatePicker selectedDate={new Date('2024-01-15')} onDateChange={onDateChange} />);

        // Open calendar
        fireEvent.click(screen.getByRole('button', { name: /открыть календарь/i }));

        // Click "Сегодня" button
        fireEvent.click(screen.getByText('Сегодня'));

        expect(onDateChange).toHaveBeenCalled();
    });
});

// ============================================================================
// FoodTrackerTabs Functionality Tests
// ============================================================================

describe('FoodTrackerTabs Functionality', () => {
    const defaultProps = {
        activeTab: 'diet' as FoodTrackerTab,
        onTabChange: jest.fn(),
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('calls onTabChange when clicking inactive tab', () => {
        const onTabChange = jest.fn();
        render(<FoodTrackerTabs activeTab="diet" onTabChange={onTabChange} />);

        const recommendationsTab = screen.getByRole('tab', { name: /рекомендации/i });
        fireEvent.click(recommendationsTab);

        expect(onTabChange).toHaveBeenCalledWith('recommendations');
    });

    it('has correct aria-selected state for active tab', () => {
        render(<FoodTrackerTabs {...defaultProps} />);

        const dietTab = screen.getByRole('tab', { name: /рацион/i });
        const recommendationsTab = screen.getByRole('tab', { name: /рекомендации/i });

        expect(dietTab).toHaveAttribute('aria-selected', 'true');
        expect(recommendationsTab).toHaveAttribute('aria-selected', 'false');
    });

    it('navigates tabs with ArrowRight key', () => {
        const onTabChange = jest.fn();
        render(<FoodTrackerTabs activeTab="diet" onTabChange={onTabChange} />);

        const dietTab = screen.getByRole('tab', { name: /рацион/i });
        fireEvent.keyDown(dietTab, { key: 'ArrowRight' });

        expect(onTabChange).toHaveBeenCalledWith('recommendations');
    });

    it('navigates tabs with ArrowLeft key', () => {
        const onTabChange = jest.fn();
        render(<FoodTrackerTabs activeTab="recommendations" onTabChange={onTabChange} />);

        const recommendationsTab = screen.getByRole('tab', { name: /рекомендации/i });
        fireEvent.keyDown(recommendationsTab, { key: 'ArrowLeft' });

        expect(onTabChange).toHaveBeenCalledWith('diet');
    });

    it('navigates to first tab with Home key', () => {
        const onTabChange = jest.fn();
        render(<FoodTrackerTabs activeTab="recommendations" onTabChange={onTabChange} />);

        const recommendationsTab = screen.getByRole('tab', { name: /рекомендации/i });
        fireEvent.keyDown(recommendationsTab, { key: 'Home' });

        expect(onTabChange).toHaveBeenCalledWith('diet');
    });

    it('navigates to last tab with End key', () => {
        const onTabChange = jest.fn();
        render(<FoodTrackerTabs activeTab="diet" onTabChange={onTabChange} />);

        const dietTab = screen.getByRole('tab', { name: /рацион/i });
        fireEvent.keyDown(dietTab, { key: 'End' });

        expect(onTabChange).toHaveBeenCalledWith('recommendations');
    });

    it('wraps around when pressing ArrowRight on last tab', () => {
        const onTabChange = jest.fn();
        render(<FoodTrackerTabs activeTab="recommendations" onTabChange={onTabChange} />);

        const recommendationsTab = screen.getByRole('tab', { name: /рекомендации/i });
        fireEvent.keyDown(recommendationsTab, { key: 'ArrowRight' });

        expect(onTabChange).toHaveBeenCalledWith('diet');
    });

    it('wraps around when pressing ArrowLeft on first tab', () => {
        const onTabChange = jest.fn();
        render(<FoodTrackerTabs activeTab="diet" onTabChange={onTabChange} />);

        const dietTab = screen.getByRole('tab', { name: /рацион/i });
        fireEvent.keyDown(dietTab, { key: 'ArrowLeft' });

        expect(onTabChange).toHaveBeenCalledWith('recommendations');
    });

    it('has correct tabIndex for active and inactive tabs', () => {
        render(<FoodTrackerTabs {...defaultProps} />);

        const dietTab = screen.getByRole('tab', { name: /рацион/i });
        const recommendationsTab = screen.getByRole('tab', { name: /рекомендации/i });

        expect(dietTab).toHaveAttribute('tabIndex', '0');
        expect(recommendationsTab).toHaveAttribute('tabIndex', '-1');
    });

    it('has proper tablist role on container', () => {
        render(<FoodTrackerTabs {...defaultProps} />);

        const tablist = screen.getByRole('tablist');
        expect(tablist).toHaveAttribute('aria-label', 'Разделы дневника питания');
    });

    it('ignores unhandled keys', () => {
        const onTabChange = jest.fn();
        render(<FoodTrackerTabs activeTab="diet" onTabChange={onTabChange} />);

        const dietTab = screen.getByRole('tab', { name: /рацион/i });
        fireEvent.keyDown(dietTab, { key: 'Enter' });

        expect(onTabChange).not.toHaveBeenCalled();
    });
});

// ============================================================================
// Accessibility Tests
// ============================================================================

describe('Accessibility Features', () => {
    it('KBZHUSummary has proper ARIA labels', () => {
        render(<KBZHUSummary current={mockKBZHU} target={mockTargetGoals} />);

        const section = screen.getByRole('region', { name: /сводка кбжу за день/i });
        expect(section).toBeInTheDocument();
    });

    it('MealSlot has proper ARIA labels', () => {
        render(
            <MealSlot
                mealType="breakfast"
                entries={[mockFoodEntry]}
                onAddEntry={jest.fn()}
            />
        );

        const section = screen.getByRole('region', { name: /завтрак - приём пищи/i });
        expect(section).toBeInTheDocument();
    });

    it('WaterTracker has proper ARIA labels', () => {
        render(
            <WaterTracker
                waterLog={mockWaterLog}
                onAddGlass={jest.fn()}
            />
        );

        const section = screen.getByRole('region', { name: /отслеживание воды/i });
        expect(section).toBeInTheDocument();
    });

    it('Progress bars have proper ARIA attributes', () => {
        const { container } = render(
            <KBZHUSummary current={mockKBZHU} target={mockTargetGoals} />
        );

        const progressBars = container.querySelectorAll('[role="progressbar"]');
        progressBars.forEach((bar) => {
            expect(bar).toHaveAttribute('aria-valuenow');
            expect(bar).toHaveAttribute('aria-valuemin', '0');
            expect(bar).toHaveAttribute('aria-valuemax', '100');
        });
    });

    it('Interactive elements have focus-visible styles', () => {
        render(
            <MealSlot
                mealType="breakfast"
                entries={[mockFoodEntry]}
                onAddEntry={jest.fn()}
            />
        );

        const addButton = screen.getByRole('button', { name: /добавить в завтрак/i });
        expect(addButton).toHaveClass('focus-visible:ring-2');
    });
});
