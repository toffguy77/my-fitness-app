/**
 * RecommendationsTab Unit Tests
 *
 * Tests for the RecommendationsTab, NutrientCategory, and NutrientRecommendationItem
 * components functionality.
 *
 * @module food-tracker/components/__tests__/RecommendationsTab.test
 */

import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecommendationsTab } from '../RecommendationsTab';
import { NutrientCategory } from '../NutrientCategory';
import { NutrientRecommendationItem } from '../NutrientRecommendationItem';
import type { NutrientRecommendation, CustomRecommendation } from '../../types';

// ============================================================================
// Mocks
// ============================================================================

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
    ChevronRight: () => <span data-testid="chevron-right">›</span>,
    ChevronDown: () => <span data-testid="chevron-down">▼</span>,
    Settings: () => <span data-testid="settings-icon">⚙</span>,
    Plus: () => <span data-testid="plus-icon">+</span>,
}));

// ============================================================================
// Test Data
// ============================================================================

const createMockRecommendation = (
    overrides: Partial<NutrientRecommendation> = {}
): NutrientRecommendation => ({
    id: `rec-${Math.random().toString(36).slice(2)}`,
    name: 'Витамин C',
    category: 'vitamins',
    dailyTarget: 90,
    unit: 'мг',
    isWeekly: false,
    isCustom: false,
    ...overrides,
});

const createMockCustomRecommendation = (
    overrides: Partial<CustomRecommendation> = {}
): CustomRecommendation => ({
    id: `custom-${Math.random().toString(36).slice(2)}`,
    name: 'Коллаген',
    dailyTarget: 10,
    unit: 'г',
    currentIntake: 5,
    ...overrides,
});

// ============================================================================
// Tests
// ============================================================================

describe('NutrientRecommendationItem', () => {
    afterEach(() => {
        cleanup();
    });

    describe('Display', () => {
        it('displays nutrient name', () => {
            const recommendation = createMockRecommendation({ name: 'Витамин D' });

            render(
                <NutrientRecommendationItem
                    recommendation={recommendation}
                    currentIntake={50}
                    onClick={jest.fn()}
                />
            );

            expect(screen.getByText('Витамин D')).toBeInTheDocument();
        });

        it('displays progress in format "current / target unit"', () => {
            const recommendation = createMockRecommendation({
                dailyTarget: 100,
                unit: 'мг',
            });

            render(
                <NutrientRecommendationItem
                    recommendation={recommendation}
                    currentIntake={75}
                    onClick={jest.fn()}
                />
            );

            expect(screen.getByText('75 / 100 мг')).toBeInTheDocument();
        });

        it('displays weekly indicator for weekly recommendations', () => {
            const recommendation = createMockRecommendation({ isWeekly: true });

            render(
                <NutrientRecommendationItem
                    recommendation={recommendation}
                    currentIntake={50}
                    onClick={jest.fn()}
                />
            );

            expect(screen.getByText('(неделя)')).toBeInTheDocument();
        });

        it('does not display weekly indicator for daily recommendations', () => {
            const recommendation = createMockRecommendation({ isWeekly: false });

            render(
                <NutrientRecommendationItem
                    recommendation={recommendation}
                    currentIntake={50}
                    onClick={jest.fn()}
                />
            );

            expect(screen.queryByText('(неделя)')).not.toBeInTheDocument();
        });
    });

    describe('Progress Bar', () => {
        it('renders progress bar', () => {
            const recommendation = createMockRecommendation();

            render(
                <NutrientRecommendationItem
                    recommendation={recommendation}
                    currentIntake={50}
                    onClick={jest.fn()}
                />
            );

            expect(screen.getByRole('progressbar')).toBeInTheDocument();
        });

        it('sets correct aria-valuenow', () => {
            const recommendation = createMockRecommendation({ dailyTarget: 100 });

            render(
                <NutrientRecommendationItem
                    recommendation={recommendation}
                    currentIntake={80}
                    onClick={jest.fn()}
                />
            );

            const progressBar = screen.getByRole('progressbar');
            expect(progressBar).toHaveAttribute('aria-valuenow', '80');
        });

        it('handles zero intake', () => {
            const recommendation = createMockRecommendation({ dailyTarget: 100 });

            render(
                <NutrientRecommendationItem
                    recommendation={recommendation}
                    currentIntake={0}
                    onClick={jest.fn()}
                />
            );

            const progressBar = screen.getByRole('progressbar');
            expect(progressBar).toHaveAttribute('aria-valuenow', '0');
        });

        it('handles intake exceeding target', () => {
            const recommendation = createMockRecommendation({ dailyTarget: 100 });

            render(
                <NutrientRecommendationItem
                    recommendation={recommendation}
                    currentIntake={150}
                    onClick={jest.fn()}
                />
            );

            const progressBar = screen.getByRole('progressbar');
            expect(progressBar).toHaveAttribute('aria-valuenow', '150');
        });
    });

    describe('Interaction', () => {
        it('calls onClick when clicked', async () => {
            const user = userEvent.setup();
            const onClick = jest.fn();
            const recommendation = createMockRecommendation();

            render(
                <NutrientRecommendationItem
                    recommendation={recommendation}
                    currentIntake={50}
                    onClick={onClick}
                />
            );

            await user.click(screen.getByRole('listitem'));
            expect(onClick).toHaveBeenCalledTimes(1);
        });
    });

    describe('Accessibility', () => {
        it('has accessible label with Russian text', () => {
            const recommendation = createMockRecommendation({
                name: 'Кальций',
                dailyTarget: 1000,
                unit: 'мг',
            });

            render(
                <NutrientRecommendationItem
                    recommendation={recommendation}
                    currentIntake={500}
                    onClick={jest.fn()}
                />
            );

            const button = screen.getByRole('listitem');
            expect(button).toHaveAttribute(
                'aria-label',
                expect.stringContaining('Кальций')
            );
            expect(button).toHaveAttribute(
                'aria-label',
                expect.stringContaining('от нормы')
            );
        });
    });
});

describe('NutrientCategory', () => {
    afterEach(() => {
        cleanup();
    });

    const defaultRecommendations = [
        createMockRecommendation({ id: '1', name: 'Витамин A' }),
        createMockRecommendation({ id: '2', name: 'Витамин B1' }),
    ];

    describe('Display', () => {
        it('displays category label in Russian', () => {
            render(
                <NutrientCategory
                    category="vitamins"
                    label="Витамины"
                    recommendations={defaultRecommendations}
                    currentIntakes={{}}
                    isExpanded={false}
                    onToggle={jest.fn()}
                    onRecommendationClick={jest.fn()}
                />
            );

            expect(screen.getByText('Витамины')).toBeInTheDocument();
        });

        it('displays recommendation count', () => {
            render(
                <NutrientCategory
                    category="vitamins"
                    label="Витамины"
                    recommendations={defaultRecommendations}
                    currentIntakes={{}}
                    isExpanded={false}
                    onToggle={jest.fn()}
                    onRecommendationClick={jest.fn()}
                />
            );

            expect(screen.getByText('(2)')).toBeInTheDocument();
        });
    });

    describe('Expansion', () => {
        it('shows recommendations when expanded', () => {
            render(
                <NutrientCategory
                    category="vitamins"
                    label="Витамины"
                    recommendations={defaultRecommendations}
                    currentIntakes={{}}
                    isExpanded={true}
                    onToggle={jest.fn()}
                    onRecommendationClick={jest.fn()}
                />
            );

            expect(screen.getByText('Витамин A')).toBeInTheDocument();
            expect(screen.getByText('Витамин B1')).toBeInTheDocument();
        });

        it('hides recommendations when collapsed', () => {
            render(
                <NutrientCategory
                    category="vitamins"
                    label="Витамины"
                    recommendations={defaultRecommendations}
                    currentIntakes={{}}
                    isExpanded={false}
                    onToggle={jest.fn()}
                    onRecommendationClick={jest.fn()}
                />
            );

            expect(screen.queryByText('Витамин A')).not.toBeInTheDocument();
            expect(screen.queryByText('Витамин B1')).not.toBeInTheDocument();
        });

        it('calls onToggle when header clicked', async () => {
            const user = userEvent.setup();
            const onToggle = jest.fn();

            render(
                <NutrientCategory
                    category="vitamins"
                    label="Витамины"
                    recommendations={defaultRecommendations}
                    currentIntakes={{}}
                    isExpanded={false}
                    onToggle={onToggle}
                    onRecommendationClick={jest.fn()}
                />
            );

            await user.click(screen.getByRole('button'));
            expect(onToggle).toHaveBeenCalledTimes(1);
        });
    });

    describe('Accessibility', () => {
        it('has aria-expanded attribute', () => {
            render(
                <NutrientCategory
                    category="vitamins"
                    label="Витамины"
                    recommendations={defaultRecommendations}
                    currentIntakes={{}}
                    isExpanded={true}
                    onToggle={jest.fn()}
                    onRecommendationClick={jest.fn()}
                />
            );

            expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
        });

        it('has aria-controls attribute', () => {
            render(
                <NutrientCategory
                    category="vitamins"
                    label="Витамины"
                    recommendations={defaultRecommendations}
                    currentIntakes={{}}
                    isExpanded={true}
                    onToggle={jest.fn()}
                    onRecommendationClick={jest.fn()}
                />
            );

            expect(screen.getByRole('button')).toHaveAttribute(
                'aria-controls',
                'category-vitamins-content'
            );
        });
    });
});

describe('RecommendationsTab', () => {
    afterEach(() => {
        cleanup();
    });

    const defaultRecommendations: NutrientRecommendation[] = [
        createMockRecommendation({ id: '1', name: 'Витамин C', category: 'vitamins' }),
        createMockRecommendation({ id: '2', name: 'Кальций', category: 'minerals' }),
        createMockRecommendation({ id: '3', name: 'Омега-3', category: 'lipids', isWeekly: true }),
    ];

    describe('Display', () => {
        it('renders header with Russian title', () => {
            render(<RecommendationsTab date="2024-01-15" />);

            expect(screen.getByText('Рекомендации')).toBeInTheDocument();
        });

        it('renders configure button with Russian text', () => {
            render(<RecommendationsTab date="2024-01-15" />);

            // Use aria-label to find the header configure button specifically
            expect(
                screen.getByRole('button', { name: /настроить список рекомендаций/i })
            ).toBeInTheDocument();
        });

        it('renders daily recommendations section', () => {
            render(
                <RecommendationsTab
                    date="2024-01-15"
                    recommendations={defaultRecommendations}
                />
            );

            expect(screen.getByText('Дневные рекомендации')).toBeInTheDocument();
        });

        it('renders weekly recommendations section when present', () => {
            render(
                <RecommendationsTab
                    date="2024-01-15"
                    recommendations={defaultRecommendations}
                />
            );

            expect(screen.getByText('Недельные рекомендации')).toBeInTheDocument();
        });

        it('renders custom recommendations section', () => {
            render(<RecommendationsTab date="2024-01-15" />);

            expect(screen.getByText('Пользовательские')).toBeInTheDocument();
        });
    });

    describe('Categories', () => {
        it('groups recommendations by category', () => {
            render(
                <RecommendationsTab
                    date="2024-01-15"
                    recommendations={defaultRecommendations}
                />
            );

            expect(screen.getByText('Витамины')).toBeInTheDocument();
            expect(screen.getByText('Минералы')).toBeInTheDocument();
            // Омега-3 is weekly so it's in weekly section, not in Липиды category
        });

        it('displays category with Russian name', () => {
            const recommendations = [
                createMockRecommendation({ category: 'fiber', name: 'Пищевые волокна' }),
            ];

            render(
                <RecommendationsTab
                    date="2024-01-15"
                    recommendations={recommendations}
                />
            );

            // Category label should be visible
            expect(screen.getByText('Клетчатка')).toBeInTheDocument();
        });
    });

    describe('Custom Recommendations', () => {
        it('displays custom recommendations', () => {
            const customRecommendations = [
                createMockCustomRecommendation({ name: 'Коллаген' }),
            ];

            render(
                <RecommendationsTab
                    date="2024-01-15"
                    customRecommendations={customRecommendations}
                />
            );

            expect(screen.getByText('Коллаген')).toBeInTheDocument();
        });

        it('displays add recommendation button with Russian text', () => {
            render(<RecommendationsTab date="2024-01-15" />);

            expect(
                screen.getByRole('button', { name: /добавить рекомендацию/i })
            ).toBeInTheDocument();
        });

        it('displays empty state message in Russian', () => {
            render(<RecommendationsTab date="2024-01-15" />);

            expect(
                screen.getByText('Нет пользовательских рекомендаций')
            ).toBeInTheDocument();
        });
    });

    describe('Loading State', () => {
        it('displays loading indicator with Russian text', () => {
            render(<RecommendationsTab date="2024-01-15" isLoading={true} />);

            expect(screen.getByText('Загрузка...')).toBeInTheDocument();
        });
    });

    describe('Interactions', () => {
        it('calls onConfigureClick when configure button clicked', async () => {
            const user = userEvent.setup();
            const onConfigureClick = jest.fn();

            render(
                <RecommendationsTab
                    date="2024-01-15"
                    onConfigureClick={onConfigureClick}
                />
            );

            // Use aria-label to find the header configure button specifically
            await user.click(
                screen.getByRole('button', { name: /настроить список рекомендаций/i })
            );
            expect(onConfigureClick).toHaveBeenCalledTimes(1);
        });

        it('calls onAddRecommendationClick when add button clicked', async () => {
            const user = userEvent.setup();
            const onAddRecommendationClick = jest.fn();

            render(
                <RecommendationsTab
                    date="2024-01-15"
                    onAddRecommendationClick={onAddRecommendationClick}
                />
            );

            await user.click(
                screen.getByRole('button', { name: /добавить рекомендацию/i })
            );
            expect(onAddRecommendationClick).toHaveBeenCalledTimes(1);
        });

        it('calls onRecommendationClick when recommendation clicked', async () => {
            const user = userEvent.setup();
            const onRecommendationClick = jest.fn();
            const recommendations = [
                createMockRecommendation({ id: '1', name: 'Витамин C', category: 'vitamins' }),
            ];

            render(
                <RecommendationsTab
                    date="2024-01-15"
                    recommendations={recommendations}
                    onRecommendationClick={onRecommendationClick}
                />
            );

            await user.click(screen.getByText('Витамин C'));
            expect(onRecommendationClick).toHaveBeenCalledWith(recommendations[0]);
        });
    });

    describe('Accessibility', () => {
        it('has accessible main container', () => {
            render(<RecommendationsTab date="2024-01-15" />);

            expect(
                screen.getByLabelText(/рекомендации по питательным веществам/i)
            ).toBeInTheDocument();
        });

        it('has accessible daily recommendations section', () => {
            render(
                <RecommendationsTab
                    date="2024-01-15"
                    recommendations={defaultRecommendations}
                />
            );

            expect(
                screen.getByLabelText(/дневные рекомендации/i)
            ).toBeInTheDocument();
        });
    });
});
