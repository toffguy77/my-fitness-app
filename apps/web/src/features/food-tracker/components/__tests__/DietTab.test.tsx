/**
 * DietTab Unit Tests
 *
 * Tests for the DietTab component functionality.
 *
 * @module food-tracker/components/__tests__/DietTab.test
 */

import React from 'react';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DietTab } from '../DietTab';
import { useFoodTrackerStore } from '../../store/foodTrackerStore';
import type { FoodEntry, MealType, EntriesByMealType } from '../../types';

// ============================================================================
// Mocks
// ============================================================================

// Mock the store
jest.mock('../../store/foodTrackerStore', () => ({
    useFoodTrackerStore: jest.fn(),
}));

// Mock lucide-react icons (all icons used by DietTab and its child components)
jest.mock('lucide-react', () => ({
    Plus: () => <span data-testid="plus-icon">+</span>,
    Sunrise: () => <span data-testid="sunrise-icon">☀</span>,
    Sun: () => <span data-testid="sun-icon">☀</span>,
    Moon: () => <span data-testid="moon-icon">🌙</span>,
    Cookie: () => <span data-testid="cookie-icon">🍪</span>,
    Droplets: () => <span data-testid="droplets-icon">💧</span>,
    Check: () => <span data-testid="check-icon">✓</span>,
    CheckCircle: () => <span data-testid="check-circle-icon">✓</span>,
    X: () => <span data-testid="x-icon">×</span>,
    Search: () => <span data-testid="search-icon">🔍</span>,
    Camera: () => <span data-testid="camera-icon">📷</span>,
    CameraOff: () => <span data-testid="camera-off-icon">📷</span>,
    Image: () => <span data-testid="image-icon">🖼</span>,
    MessageCircle: () => <span data-testid="message-icon">💬</span>,
    Barcode: () => <span data-testid="barcode-icon">▮</span>,
    ArrowLeft: () => <span data-testid="arrow-left-icon">←</span>,
    Clock: () => <span data-testid="clock-icon">🕐</span>,
    Star: () => <span data-testid="star-icon">★</span>,
    ChevronRight: () => <span data-testid="chevron-right-icon">›</span>,
    ChevronLeft: () => <span data-testid="chevron-left-icon">‹</span>,
    Calendar: () => <span data-testid="calendar-icon">📅</span>,
    Edit2: () => <span data-testid="edit-icon">✎</span>,
    Trash2: () => <span data-testid="trash-icon">🗑</span>,
    Send: () => <span data-testid="send-icon">➤</span>,
    Upload: () => <span data-testid="upload-icon">⬆</span>,
    AlertCircle: () => <span data-testid="alert-icon">⚠</span>,
    RefreshCw: () => <span data-testid="refresh-icon">↻</span>,
    Save: () => <span data-testid="save-icon">💾</span>,
    User: () => <span data-testid="user-icon">👤</span>,
    Bot: () => <span data-testid="bot-icon">🤖</span>,
    Pencil: () => <span data-testid="pencil-icon">✏</span>,
}));

// ============================================================================
// Test Data
// ============================================================================

const createMockEntry = (overrides: Partial<FoodEntry> = {}): FoodEntry => ({
    id: `entry-${Math.random().toString(36).slice(2)}`,
    foodId: 'food-1',
    foodName: 'Яблоко',
    mealType: 'breakfast',
    portionType: 'grams',
    portionAmount: 150,
    nutrition: {
        calories: 78,
        protein: 0.5,
        fat: 0.3,
        carbs: 21,
    },
    time: '08:30',
    date: '2024-01-15',
    createdAt: '2024-01-15T08:30:00Z',
    updatedAt: '2024-01-15T08:30:00Z',
    ...overrides,
});

const createMockStore = (overrides = {}) => ({
    waterIntake: 0,
    waterGoal: 8,
    glassSize: 250,
    selectedDate: '2024-01-15',
    addWater: jest.fn(),
    ...overrides,
});

const createDefaultProps = (overrides = {}) => ({
    entries: {
        breakfast: [],
        lunch: [],
        dinner: [],
        snack: [],
    } as EntriesByMealType,
    dailyTotals: {
        calories: 0,
        protein: 0,
        fat: 0,
        carbs: 0,
    },
    targetGoals: {
        calories: 2000,
        protein: 150,
        fat: 67,
        carbs: 200,
    },
    isLoading: false,
    onAddEntry: jest.fn().mockResolvedValue(createMockEntry()),
    onUpdateEntry: jest.fn().mockResolvedValue(createMockEntry()),
    onDeleteEntry: jest.fn().mockResolvedValue(true),
    ...overrides,
});

// ============================================================================
// Tests
// ============================================================================

describe('DietTab', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        Element.prototype.scrollIntoView = jest.fn();
        (useFoodTrackerStore as unknown as jest.Mock).mockReturnValue(createMockStore());
    });

    afterEach(() => {
        cleanup();
    });

    describe('Initial Rendering', () => {
        it('renders КБЖУ summary', () => {
            render(<DietTab {...createDefaultProps()} />);
            expect(screen.getByText('Дневная норма')).toBeInTheDocument();
        });

        it('renders all four meal slots with Russian labels', () => {
            render(<DietTab {...createDefaultProps()} />);

            expect(screen.getByText('Завтрак')).toBeInTheDocument();
            expect(screen.getByText('Обед')).toBeInTheDocument();
            expect(screen.getByText('Ужин')).toBeInTheDocument();
            expect(screen.getByText('Перекус')).toBeInTheDocument();
        });

        it('renders water tracker', () => {
            render(<DietTab {...createDefaultProps()} />);
            expect(screen.getByText('Вода')).toBeInTheDocument();
        });

        it('renders FAB button', () => {
            render(<DietTab {...createDefaultProps()} />);
            const fabButton = screen.getByTestId('fab-add-food');
            expect(fabButton).toBeInTheDocument();
        });
    });

    describe('КБЖУ Display', () => {
        it('displays daily totals', () => {
            const props = createDefaultProps({
                dailyTotals: {
                    calories: 1500,
                    protein: 100,
                    fat: 50,
                    carbs: 150,
                },
            });

            render(<DietTab {...props} />);
            expect(screen.getByText(/1500/)).toBeInTheDocument();
        });

        it('displays target goals', () => {
            const props = createDefaultProps({
                targetGoals: {
                    calories: 2000,
                    protein: 150,
                    fat: 67,
                    carbs: 200,
                },
            });

            render(<DietTab {...props} />);
            expect(screen.getByText(/2000/)).toBeInTheDocument();
        });
    });

    describe('Meal Slots', () => {
        it('displays entries in correct meal slots', () => {
            const breakfastEntry = createMockEntry({
                id: 'entry-1',
                foodName: 'Овсянка',
                mealType: 'breakfast',
            });
            const lunchEntry = createMockEntry({
                id: 'entry-2',
                foodName: 'Салат',
                mealType: 'lunch',
            });

            const props = createDefaultProps({
                entries: {
                    breakfast: [breakfastEntry],
                    lunch: [lunchEntry],
                    dinner: [],
                    snack: [],
                },
            });

            render(<DietTab {...props} />);

            expect(screen.getByText('Овсянка')).toBeInTheDocument();
            expect(screen.getByText('Салат')).toBeInTheDocument();
        });

        it('shows empty state for meal slots without entries', () => {
            render(<DietTab {...createDefaultProps()} />);

            const emptyMessages = screen.getAllByText('Нет записей');
            expect(emptyMessages.length).toBe(4);
        });
    });

    describe('Water Tracker', () => {
        it('displays water intake', () => {
            (useFoodTrackerStore as unknown as jest.Mock).mockReturnValue(createMockStore({
                waterIntake: 5,
                waterGoal: 8,
            }));

            render(<DietTab {...createDefaultProps()} />);
            expect(screen.getByText('5 / 8 стаканов')).toBeInTheDocument();
        });

        it('calls addWater when add button clicked', async () => {
            const user = userEvent.setup();
            const addWater = jest.fn();
            (useFoodTrackerStore as unknown as jest.Mock).mockReturnValue(createMockStore({ addWater }));

            render(<DietTab {...createDefaultProps()} />);

            const addWaterButton = screen.getByRole('button', { name: /добавить стакан/i });
            await user.click(addWaterButton);

            expect(addWater).toHaveBeenCalledWith(1);
        });
    });

    describe('FAB Button', () => {
        it('opens modal when FAB clicked', async () => {
            const user = userEvent.setup();
            render(<DietTab {...createDefaultProps()} />);

            const fabButton = screen.getByTestId('fab-add-food');
            await user.click(fabButton);

            await waitFor(() => {
                expect(screen.getByRole('dialog')).toBeInTheDocument();
            });
        });

        it('has accessible label in Russian', () => {
            render(<DietTab {...createDefaultProps()} />);

            const fabButton = screen.getByTestId('fab-add-food');
            expect(fabButton).toHaveAttribute('aria-label', 'Добавить еду');
        });
    });

    describe('Add Entry Flow', () => {
        it('opens modal when meal slot add button clicked', async () => {
            const user = userEvent.setup();
            render(<DietTab {...createDefaultProps()} />);

            const addButtons = screen.getAllByRole('button', { name: /добавить в/i });
            await user.click(addButtons[0]);

            await waitFor(() => {
                expect(screen.getByRole('dialog')).toBeInTheDocument();
            });
        });
    });

    describe('Delete Entry', () => {
        it('displays entry that can be deleted', async () => {
            const entry = createMockEntry({
                id: 'entry-1',
                foodName: 'Яблоко',
                mealType: 'breakfast',
            });

            const props = createDefaultProps({
                entries: {
                    breakfast: [entry],
                    lunch: [],
                    dinner: [],
                    snack: [],
                },
            });

            render(<DietTab {...props} />);

            expect(screen.getByText('Яблоко')).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /яблоко, 150 г, 78 ккал/i })).toBeInTheDocument();
        });
    });

    describe('Edit Entry Flow', () => {
        it('opens modal with entry data when entry is clicked', async () => {
            const user = userEvent.setup();
            const entry = createMockEntry({
                id: 'entry-1',
                foodName: 'Яблоко',
                mealType: 'breakfast',
            });

            const props = createDefaultProps({
                entries: {
                    breakfast: [entry],
                    lunch: [],
                    dinner: [],
                    snack: [],
                },
            });

            render(<DietTab {...props} />);

            const entryElement = screen.getByRole('button', { name: /яблоко, 150 г, 78 ккал/i });
            await user.click(entryElement);

            await waitFor(() => {
                expect(screen.getByRole('dialog')).toBeInTheDocument();
            });
        });

        it('displays entry with correct portion and calories', () => {
            const entry = createMockEntry({
                id: 'entry-1',
                foodName: 'Яблоко',
                mealType: 'breakfast',
                portionAmount: 150,
                nutrition: { calories: 78, protein: 0.5, fat: 0.3, carbs: 21 },
            });

            const props = createDefaultProps({
                entries: {
                    breakfast: [entry],
                    lunch: [],
                    dinner: [],
                    snack: [],
                },
            });

            render(<DietTab {...props} />);

            expect(screen.getByText('Яблоко')).toBeInTheDocument();
            expect(screen.getByText('150 г')).toBeInTheDocument();
            expect(screen.getAllByText('78 ккал').length).toBeGreaterThanOrEqual(1);
        });
    });

    describe('Loading State', () => {
        it('displays loading state', () => {
            const props = createDefaultProps({ isLoading: true });
            render(<DietTab {...props} />);
            expect(screen.getByText('Загрузка...')).toBeInTheDocument();
        });
    });

    describe('Accessibility', () => {
        it('has accessible meal slot sections', () => {
            render(<DietTab {...createDefaultProps()} />);

            expect(screen.getByLabelText(/завтрак - приём пищи/i)).toBeInTheDocument();
            expect(screen.getByLabelText(/обед - приём пищи/i)).toBeInTheDocument();
            expect(screen.getByLabelText(/ужин - приём пищи/i)).toBeInTheDocument();
            expect(screen.getByLabelText(/перекус - приём пищи/i)).toBeInTheDocument();
        });

        it('has accessible КБЖУ summary', () => {
            render(<DietTab {...createDefaultProps()} />);
            expect(screen.getByLabelText(/сводка кбжу за день/i)).toBeInTheDocument();
        });

        it('has accessible water tracker', () => {
            render(<DietTab {...createDefaultProps()} />);
            expect(screen.getByLabelText(/отслеживание воды/i)).toBeInTheDocument();
        });
    });

    describe('Custom className', () => {
        it('applies custom className', () => {
            const { container } = render(<DietTab {...createDefaultProps()} className="custom-class" />);
            expect(container.firstChild).toHaveClass('custom-class');
        });
    });
});
