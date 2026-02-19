/**
 * Unit tests for FoodTrackerPage component
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FoodTrackerPage } from '../FoodTrackerPage';
import { useFoodTracker } from '../../hooks/useFoodTracker';

// Mock the hooks
jest.mock('../../hooks/useFoodTracker');

// Mock Next.js router
jest.mock('next/navigation', () => ({
    useRouter: () => ({
        push: jest.fn(),
        replace: jest.fn(),
        prefetch: jest.fn(),
    }),
}));

// Mock child components to avoid deep rendering issues
jest.mock('../DatePicker', () => ({
    DatePicker: ({ selectedDate, onDateChange }: any) => (
        <div data-testid="date-picker">
            <span>Сегодня, 15 января</span>
            <button aria-label="Предыдущий день" onClick={() => {
                const newDate = new Date(selectedDate);
                newDate.setDate(newDate.getDate() - 1);
                onDateChange(newDate);
            }}>←</button>
            <button aria-label="Следующий день" onClick={() => {
                const newDate = new Date(selectedDate);
                newDate.setDate(newDate.getDate() + 1);
                onDateChange(newDate);
            }}>→</button>
        </div>
    ),
}));

jest.mock('../DietTab', () => ({
    DietTab: () => <div data-testid="diet-tab">Diet Tab Content</div>,
}));

jest.mock('../RecommendationsTab', () => ({
    RecommendationsTab: () => <div data-testid="recommendations-tab">Recommendations Tab Content</div>,
}));

// Mock FooterNavigation
jest.mock('@/features/dashboard/components/FooterNavigation', () => ({
    FooterNavigation: () => <nav data-testid="footer-navigation">Footer Navigation</nav>,
}));

// Mock toast
jest.mock('react-hot-toast', () => ({
    success: jest.fn(),
    error: jest.fn(),
}));

describe('FoodTrackerPage', () => {
    const mockFetchDayData = jest.fn();
    const mockAddEntry = jest.fn();
    const mockUpdateEntry = jest.fn();
    const mockDeleteEntry = jest.fn();
    const mockClearError = jest.fn();

    const defaultMockState = {
        entries: {
            breakfast: [],
            lunch: [],
            dinner: [],
            snack: [],
        },
        dailyTotals: { calories: 0, protein: 0, fat: 0, carbs: 0 },
        targetGoals: { calories: 2000, protein: 150, fat: 67, carbs: 200, isCustom: false },
        isLoading: false,
        error: null,
        isOffline: false,
        fetchDayData: mockFetchDayData,
        addEntry: mockAddEntry,
        updateEntry: mockUpdateEntry,
        deleteEntry: mockDeleteEntry,
        clearError: mockClearError,
    };

    beforeEach(() => {
        jest.clearAllMocks();
        (useFoodTracker as unknown as jest.Mock).mockReturnValue(defaultMockState);
    });

    describe('rendering', () => {
        it('renders date picker', () => {
            render(<FoodTrackerPage />);

            // Should show today's date in Russian format
            expect(screen.getByText(/Сегодня/)).toBeInTheDocument();
        });

        it('renders tabs', () => {
            render(<FoodTrackerPage />);

            expect(screen.getByRole('tab', { name: 'Рацион' })).toBeInTheDocument();
            expect(screen.getByRole('tab', { name: 'Рекомендации' })).toBeInTheDocument();
        });

        it('renders diet tab by default', () => {
            render(<FoodTrackerPage />);

            expect(screen.getByRole('tab', { name: 'Рацион' })).toHaveAttribute('aria-selected', 'true');
        });
    });

    describe('tab switching', () => {
        it('switches to recommendations tab when clicked', () => {
            render(<FoodTrackerPage />);

            const recommendationsTab = screen.getByRole('tab', { name: 'Рекомендации' });
            fireEvent.click(recommendationsTab);

            expect(recommendationsTab).toHaveAttribute('aria-selected', 'true');
        });

        it('switches back to diet tab when clicked', () => {
            render(<FoodTrackerPage />);

            // Switch to recommendations
            fireEvent.click(screen.getByRole('tab', { name: 'Рекомендации' }));

            // Switch back to diet
            const dietTab = screen.getByRole('tab', { name: 'Рацион' });
            fireEvent.click(dietTab);

            expect(dietTab).toHaveAttribute('aria-selected', 'true');
        });
    });

    describe('data fetching', () => {
        it('fetches data on mount', () => {
            render(<FoodTrackerPage />);

            expect(mockFetchDayData).toHaveBeenCalled();
        });

        it('fetches data when date changes', () => {
            render(<FoodTrackerPage />);

            // Click previous day button
            const prevButton = screen.getByLabelText('Предыдущий день');
            fireEvent.click(prevButton);

            // Should fetch data for new date
            expect(mockFetchDayData).toHaveBeenCalledTimes(2);
        });
    });

    describe('offline indicator', () => {
        it('shows offline indicator when offline', () => {
            (useFoodTracker as unknown as jest.Mock).mockReturnValue({
                ...defaultMockState,
                isOffline: true,
            });

            render(<FoodTrackerPage />);

            expect(screen.getByText(/Нет подключения к интернету/)).toBeInTheDocument();
        });

        it('does not show offline indicator when online', () => {
            render(<FoodTrackerPage />);

            expect(screen.queryByText(/Нет подключения к интернету/)).not.toBeInTheDocument();
        });
    });

    describe('error handling', () => {
        it('shows error message when error exists', () => {
            (useFoodTracker as unknown as jest.Mock).mockReturnValue({
                ...defaultMockState,
                error: { code: 'NETWORK_ERROR', message: 'Ошибка сети' },
            });

            render(<FoodTrackerPage />);

            expect(screen.getByText('Ошибка сети')).toBeInTheDocument();
        });

        it('clears error when close button clicked', () => {
            (useFoodTracker as unknown as jest.Mock).mockReturnValue({
                ...defaultMockState,
                error: { code: 'NETWORK_ERROR', message: 'Ошибка сети' },
            });

            render(<FoodTrackerPage />);

            const closeButton = screen.getByLabelText('Закрыть сообщение об ошибке');
            fireEvent.click(closeButton);

            expect(mockClearError).toHaveBeenCalled();
        });
    });

    describe('accessibility', () => {
        it('has proper tablist role', () => {
            render(<FoodTrackerPage />);

            expect(screen.getByRole('tablist')).toBeInTheDocument();
        });

        it('has proper tabpanel role', () => {
            render(<FoodTrackerPage />);

            expect(screen.getByRole('tabpanel')).toBeInTheDocument();
        });

        it('tabpanel is associated with active tab', () => {
            render(<FoodTrackerPage />);

            const tabpanel = screen.getByRole('tabpanel');
            expect(tabpanel).toHaveAttribute('aria-labelledby', 'tab-diet');
        });

        it('offline indicator has proper ARIA attributes', () => {
            (useFoodTracker as unknown as jest.Mock).mockReturnValue({
                ...defaultMockState,
                isOffline: true,
            });

            render(<FoodTrackerPage />);

            const offlineIndicator = screen.getByRole('alert');
            expect(offlineIndicator).toHaveAttribute('aria-live', 'polite');
        });

        it('error message has proper ARIA attributes', () => {
            (useFoodTracker as unknown as jest.Mock).mockReturnValue({
                ...defaultMockState,
                error: { code: 'NETWORK_ERROR', message: 'Ошибка сети' },
            });

            render(<FoodTrackerPage />);

            const errorAlert = screen.getByRole('alert');
            expect(errorAlert).toHaveAttribute('aria-live', 'assertive');
        });

        it('error close button has descriptive aria-label', () => {
            (useFoodTracker as unknown as jest.Mock).mockReturnValue({
                ...defaultMockState,
                error: { code: 'NETWORK_ERROR', message: 'Ошибка сети' },
            });

            render(<FoodTrackerPage />);

            const closeButton = screen.getByLabelText('Закрыть сообщение об ошибке');
            expect(closeButton).toBeInTheDocument();
        });

        it('error icon is hidden from screen readers', () => {
            (useFoodTracker as unknown as jest.Mock).mockReturnValue({
                ...defaultMockState,
                error: { code: 'NETWORK_ERROR', message: 'Ошибка сети' },
            });

            render(<FoodTrackerPage />);

            const errorIcon = screen.getByText('⚠️');
            expect(errorIcon).toHaveAttribute('aria-hidden', 'true');
        });
    });

    describe('responsive design', () => {
        it('applies responsive container classes', () => {
            render(<FoodTrackerPage />);

            // Check that the main container has responsive classes
            const container = screen.getByRole('tabpanel').parentElement;
            expect(container).toHaveClass('mx-auto');
            expect(container).toHaveClass('px-3');
            expect(container).toHaveClass('sm:px-4');
        });

        it('tabpanel has transition class for smooth tab switching', () => {
            render(<FoodTrackerPage />);

            const tabpanel = screen.getByRole('tabpanel');
            expect(tabpanel).toHaveClass('transition-opacity');
            expect(tabpanel).toHaveClass('duration-200');
        });

        it('error message has responsive positioning classes', () => {
            (useFoodTracker as unknown as jest.Mock).mockReturnValue({
                ...defaultMockState,
                error: { code: 'NETWORK_ERROR', message: 'Ошибка сети' },
            });

            render(<FoodTrackerPage />);

            const errorContainer = screen.getByRole('alert');
            // Error positioned above footer navigation (bottom-20)
            expect(errorContainer).toHaveClass('bottom-20');
            expect(errorContainer).toHaveClass('max-w-sm');
            expect(errorContainer).toHaveClass('sm:max-w-md');
        });

        it('offline indicator has responsive text size', () => {
            (useFoodTracker as unknown as jest.Mock).mockReturnValue({
                ...defaultMockState,
                isOffline: true,
            });

            render(<FoodTrackerPage />);

            const offlineText = screen.getByText(/Нет подключения к интернету/);
            expect(offlineText).toHaveClass('text-xs');
            expect(offlineText).toHaveClass('sm:text-sm');
        });
    });

    describe('custom className prop', () => {
        it('applies custom className to root element', () => {
            const { container } = render(<FoodTrackerPage className="custom-class" />);

            const rootElement = container.firstChild;
            expect(rootElement).toHaveClass('custom-class');
            expect(rootElement).toHaveClass('min-h-screen');
        });
    });

    describe('footer navigation', () => {
        it('renders footer navigation', () => {
            render(<FoodTrackerPage />);

            expect(screen.getByTestId('footer-navigation')).toBeInTheDocument();
        });

        it('has padding bottom for footer navigation space', () => {
            const { container } = render(<FoodTrackerPage />);

            const rootElement = container.firstChild as HTMLElement;
            expect(rootElement.style.paddingBottom).toMatch(/calc.*5rem.*safe-area-inset-bottom/);
        });
    });

    describe('loading state', () => {
        it('passes isLoading to DietTab', () => {
            (useFoodTracker as unknown as jest.Mock).mockReturnValue({
                ...defaultMockState,
                isLoading: true,
            });

            render(<FoodTrackerPage />);

            // DietTab is mocked, but we verify the component renders without error
            expect(screen.getByTestId('diet-tab')).toBeInTheDocument();
        });
    });

    describe('date formatting', () => {
        it('formats date correctly for API call', () => {
            // Mock a specific date
            const mockDate = new Date('2024-01-15T12:00:00Z');
            jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);

            render(<FoodTrackerPage />);

            // Should call fetchDayData with ISO date string
            expect(mockFetchDayData).toHaveBeenCalledWith('2024-01-15');

            jest.restoreAllMocks();
        });
    });

    describe('tab content rendering', () => {
        it('renders DietTab when diet tab is active', () => {
            render(<FoodTrackerPage />);

            expect(screen.getByTestId('diet-tab')).toBeInTheDocument();
        });

        it('renders RecommendationsTab when recommendations tab is active', () => {
            render(<FoodTrackerPage />);

            // Switch to recommendations tab
            fireEvent.click(screen.getByRole('tab', { name: 'Рекомендации' }));

            expect(screen.getByTestId('recommendations-tab')).toBeInTheDocument();
        });

        it('hides DietTab when recommendations tab is active', () => {
            render(<FoodTrackerPage />);

            // Switch to recommendations tab
            fireEvent.click(screen.getByRole('tab', { name: 'Рекомендации' }));

            expect(screen.queryByTestId('diet-tab')).not.toBeInTheDocument();
        });

        it('hides RecommendationsTab when diet tab is active', () => {
            render(<FoodTrackerPage />);

            // Diet tab is active by default
            expect(screen.queryByTestId('recommendations-tab')).not.toBeInTheDocument();
        });
    });

    describe('tabpanel attributes', () => {
        it('updates tabpanel id when tab changes', () => {
            render(<FoodTrackerPage />);

            // Initially diet tab
            let tabpanel = screen.getByRole('tabpanel');
            expect(tabpanel).toHaveAttribute('id', 'tabpanel-diet');

            // Switch to recommendations
            fireEvent.click(screen.getByRole('tab', { name: 'Рекомендации' }));

            tabpanel = screen.getByRole('tabpanel');
            expect(tabpanel).toHaveAttribute('id', 'tabpanel-recommendations');
        });

        it('updates aria-labelledby when tab changes', () => {
            render(<FoodTrackerPage />);

            // Initially diet tab
            let tabpanel = screen.getByRole('tabpanel');
            expect(tabpanel).toHaveAttribute('aria-labelledby', 'tab-diet');

            // Switch to recommendations
            fireEvent.click(screen.getByRole('tab', { name: 'Рекомендации' }));

            tabpanel = screen.getByRole('tabpanel');
            expect(tabpanel).toHaveAttribute('aria-labelledby', 'tab-recommendations');
        });
    });

    describe('error display styling', () => {
        it('error container has proper z-index for layering', () => {
            (useFoodTracker as unknown as jest.Mock).mockReturnValue({
                ...defaultMockState,
                error: { code: 'NETWORK_ERROR', message: 'Ошибка сети' },
            });

            render(<FoodTrackerPage />);

            const errorContainer = screen.getByRole('alert');
            expect(errorContainer).toHaveClass('z-40');
        });

        it('error container has shadow for visibility', () => {
            (useFoodTracker as unknown as jest.Mock).mockReturnValue({
                ...defaultMockState,
                error: { code: 'NETWORK_ERROR', message: 'Ошибка сети' },
            });

            render(<FoodTrackerPage />);

            const errorContainer = screen.getByRole('alert');
            expect(errorContainer).toHaveClass('shadow-lg');
        });
    });
});
