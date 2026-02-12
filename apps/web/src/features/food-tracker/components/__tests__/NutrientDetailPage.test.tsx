/**
 * Unit tests for NutrientDetailPage component
 *
 * Tests:
 * - Information display with Russian section headers
 * - Sources rendering
 * - Back navigation
 * - Progress bar display
 * - Weekly view indicator
 *
 * @module food-tracker/components/__tests__/NutrientDetailPage.test
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { NutrientDetailPage } from '../NutrientDetailPage';
import type { NutrientDetail, NutrientFoodSource } from '../../types';

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
    ArrowLeft: ({ className }: { className?: string }) => (
        <svg data-testid="arrow-left-icon" className={className} />
    ),
    Info: ({ className }: { className?: string }) => (
        <svg data-testid="info-icon" className={className} />
    ),
    Heart: ({ className }: { className?: string }) => (
        <svg data-testid="heart-icon" className={className} />
    ),
    Utensils: ({ className }: { className?: string }) => (
        <svg data-testid="utensils-icon" className={className} />
    ),
}));

// ============================================================================
// Test Data
// ============================================================================

const createMockNutrient = (overrides?: Partial<NutrientDetail>): NutrientDetail => ({
    id: 'vitamin-c',
    name: 'Витамин C',
    category: 'vitamins',
    description: 'Витамин C — мощный антиоксидант, необходимый для иммунной системы.',
    benefits: 'Укрепляет иммунитет, улучшает состояние кожи.',
    effects: 'Участвует в синтезе коллагена, защищает клетки от окислительного стресса.',
    minRecommendation: 60,
    optimalRecommendation: 90,
    unit: 'мг',
    sourcesInDiet: [
        { foodName: 'Апельсин', amount: 50, unit: 'мг', contribution: 55.6 },
        { foodName: 'Киви', amount: 30, unit: 'мг', contribution: 33.3 },
    ],
    ...overrides,
});

const mockOnBack = jest.fn();

// ============================================================================
// Test Suite
// ============================================================================

describe('NutrientDetailPage', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // ========================================================================
    // Russian Section Headers Tests
    // ========================================================================

    describe('Russian section headers', () => {
        it('displays "Что это и зачем принимать" section header', () => {
            const nutrient = createMockNutrient();
            render(
                <NutrientDetailPage
                    nutrient={nutrient}
                    currentIntake={45}
                    onBack={mockOnBack}
                />
            );

            expect(screen.getByText('Что это и зачем принимать')).toBeInTheDocument();
        });

        it('displays "На что влияет и как" section header', () => {
            const nutrient = createMockNutrient();
            render(
                <NutrientDetailPage
                    nutrient={nutrient}
                    currentIntake={45}
                    onBack={mockOnBack}
                />
            );

            expect(screen.getByText('На что влияет и как')).toBeInTheDocument();
        });

        it('displays "Источники в рационе" section header', () => {
            const nutrient = createMockNutrient();
            render(
                <NutrientDetailPage
                    nutrient={nutrient}
                    currentIntake={45}
                    onBack={mockOnBack}
                />
            );

            expect(screen.getByText('Источники в рационе')).toBeInTheDocument();
        });

        it('displays "Рекомендации" section header', () => {
            const nutrient = createMockNutrient();
            render(
                <NutrientDetailPage
                    nutrient={nutrient}
                    currentIntake={45}
                    onBack={mockOnBack}
                />
            );

            expect(screen.getByText('Рекомендации')).toBeInTheDocument();
        });

        it('displays "Польза" section when benefits provided', () => {
            const nutrient = createMockNutrient({
                benefits: 'Укрепляет иммунитет',
            });
            render(
                <NutrientDetailPage
                    nutrient={nutrient}
                    currentIntake={45}
                    onBack={mockOnBack}
                />
            );

            expect(screen.getByText('Польза')).toBeInTheDocument();
        });

        it('does not display "Польза" section when benefits not provided', () => {
            const nutrient = createMockNutrient({
                benefits: undefined,
            });
            render(
                <NutrientDetailPage
                    nutrient={nutrient}
                    currentIntake={45}
                    onBack={mockOnBack}
                />
            );

            expect(screen.queryByText('Польза')).not.toBeInTheDocument();
        });
    });

    // ========================================================================
    // Information Display Tests
    // ========================================================================

    describe('information display', () => {
        it('displays nutrient name in header', () => {
            const nutrient = createMockNutrient({ name: 'Витамин D' });
            render(
                <NutrientDetailPage
                    nutrient={nutrient}
                    currentIntake={10}
                    onBack={mockOnBack}
                />
            );

            expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Витамин D');
        });

        it('displays description content', () => {
            const nutrient = createMockNutrient({
                description: 'Важный витамин для здоровья костей.',
            });
            render(
                <NutrientDetailPage
                    nutrient={nutrient}
                    currentIntake={10}
                    onBack={mockOnBack}
                />
            );

            expect(screen.getByText('Важный витамин для здоровья костей.')).toBeInTheDocument();
        });

        it('displays effects content', () => {
            const nutrient = createMockNutrient({
                effects: 'Улучшает усвоение кальция.',
            });
            render(
                <NutrientDetailPage
                    nutrient={nutrient}
                    currentIntake={10}
                    onBack={mockOnBack}
                />
            );

            expect(screen.getByText('Улучшает усвоение кальция.')).toBeInTheDocument();
        });

        it('displays "Информация недоступна" when description is missing', () => {
            const nutrient = createMockNutrient({
                description: undefined,
            });
            render(
                <NutrientDetailPage
                    nutrient={nutrient}
                    currentIntake={10}
                    onBack={mockOnBack}
                />
            );

            expect(screen.getAllByText('Информация недоступна').length).toBeGreaterThanOrEqual(1);
        });

        it('displays current intake and target', () => {
            const nutrient = createMockNutrient({
                optimalRecommendation: 100,
                unit: 'мг',
            });
            render(
                <NutrientDetailPage
                    nutrient={nutrient}
                    currentIntake={75}
                    onBack={mockOnBack}
                />
            );

            expect(screen.getByText('75 / 100 мг')).toBeInTheDocument();
        });

        it('displays min and optimal recommendations', () => {
            const nutrient = createMockNutrient({
                minRecommendation: 50,
                optimalRecommendation: 100,
                unit: 'мг',
            });
            render(
                <NutrientDetailPage
                    nutrient={nutrient}
                    currentIntake={75}
                    onBack={mockOnBack}
                />
            );

            expect(screen.getByText(/Мин: 50 мг/)).toBeInTheDocument();
            expect(screen.getByText(/Оптимум: 100 мг/)).toBeInTheDocument();
        });

        it('displays percentage of norm', () => {
            const nutrient = createMockNutrient({
                optimalRecommendation: 100,
            });
            render(
                <NutrientDetailPage
                    nutrient={nutrient}
                    currentIntake={75}
                    onBack={mockOnBack}
                />
            );

            expect(screen.getByText('75% от нормы')).toBeInTheDocument();
        });
    });

    // ========================================================================
    // Sources Rendering Tests
    // ========================================================================

    describe('sources rendering', () => {
        it('renders food sources from diet', () => {
            const sources: NutrientFoodSource[] = [
                { foodName: 'Апельсин', amount: 50, unit: 'мг', contribution: 55.6 },
                { foodName: 'Киви', amount: 30, unit: 'мг', contribution: 33.3 },
            ];
            const nutrient = createMockNutrient({ sourcesInDiet: sources });
            render(
                <NutrientDetailPage
                    nutrient={nutrient}
                    currentIntake={80}
                    onBack={mockOnBack}
                />
            );

            expect(screen.getByText('Апельсин')).toBeInTheDocument();
            expect(screen.getByText('Киви')).toBeInTheDocument();
        });

        it('displays source amounts with units', () => {
            const sources: NutrientFoodSource[] = [
                { foodName: 'Апельсин', amount: 50, unit: 'мг', contribution: 55.6 },
            ];
            const nutrient = createMockNutrient({ sourcesInDiet: sources });
            render(
                <NutrientDetailPage
                    nutrient={nutrient}
                    currentIntake={80}
                    onBack={mockOnBack}
                />
            );

            expect(screen.getByText('50 мг')).toBeInTheDocument();
        });

        it('displays source contribution percentages', () => {
            const sources: NutrientFoodSource[] = [
                { foodName: 'Апельсин', amount: 50, unit: 'мг', contribution: 55.6 },
            ];
            const nutrient = createMockNutrient({ sourcesInDiet: sources });
            render(
                <NutrientDetailPage
                    nutrient={nutrient}
                    currentIntake={80}
                    onBack={mockOnBack}
                />
            );

            expect(screen.getByText('(55.6%)')).toBeInTheDocument();
        });

        it('displays empty state message when no sources', () => {
            const nutrient = createMockNutrient({ sourcesInDiet: [] });
            render(
                <NutrientDetailPage
                    nutrient={nutrient}
                    currentIntake={0}
                    onBack={mockOnBack}
                />
            );

            expect(
                screen.getByText('В вашем рационе пока нет продуктов с этим нутриентом')
            ).toBeInTheDocument();
        });

        it('displays empty state message when sources undefined', () => {
            const nutrient = createMockNutrient({ sourcesInDiet: undefined });
            render(
                <NutrientDetailPage
                    nutrient={nutrient}
                    currentIntake={0}
                    onBack={mockOnBack}
                />
            );

            expect(
                screen.getByText('В вашем рационе пока нет продуктов с этим нутриентом')
            ).toBeInTheDocument();
        });

        it('renders multiple sources correctly', () => {
            const sources: NutrientFoodSource[] = [
                { foodName: 'Апельсин', amount: 50, unit: 'мг', contribution: 40 },
                { foodName: 'Киви', amount: 30, unit: 'мг', contribution: 24 },
                { foodName: 'Клубника', amount: 20, unit: 'мг', contribution: 16 },
            ];
            const nutrient = createMockNutrient({ sourcesInDiet: sources });
            render(
                <NutrientDetailPage
                    nutrient={nutrient}
                    currentIntake={100}
                    onBack={mockOnBack}
                />
            );

            expect(screen.getByText('Апельсин')).toBeInTheDocument();
            expect(screen.getByText('Киви')).toBeInTheDocument();
            expect(screen.getByText('Клубника')).toBeInTheDocument();
        });
    });

    // ========================================================================
    // Back Navigation Tests
    // ========================================================================

    describe('back navigation', () => {
        it('calls onBack when back button clicked', () => {
            const nutrient = createMockNutrient();
            render(
                <NutrientDetailPage
                    nutrient={nutrient}
                    currentIntake={45}
                    onBack={mockOnBack}
                />
            );

            const backButton = screen.getByRole('button', { name: /назад/i });
            fireEvent.click(backButton);

            expect(mockOnBack).toHaveBeenCalledTimes(1);
        });

        it('back button has correct aria-label in Russian', () => {
            const nutrient = createMockNutrient();
            render(
                <NutrientDetailPage
                    nutrient={nutrient}
                    currentIntake={45}
                    onBack={mockOnBack}
                />
            );

            expect(
                screen.getByRole('button', { name: 'Назад к рекомендациям' })
            ).toBeInTheDocument();
        });

        it('renders back arrow icon', () => {
            const nutrient = createMockNutrient();
            render(
                <NutrientDetailPage
                    nutrient={nutrient}
                    currentIntake={45}
                    onBack={mockOnBack}
                />
            );

            expect(screen.getByTestId('arrow-left-icon')).toBeInTheDocument();
        });
    });

    // ========================================================================
    // Progress Bar Tests
    // ========================================================================

    describe('progress bar', () => {
        it('renders progress bar with correct role', () => {
            const nutrient = createMockNutrient({ optimalRecommendation: 100 });
            render(
                <NutrientDetailPage
                    nutrient={nutrient}
                    currentIntake={50}
                    onBack={mockOnBack}
                />
            );

            expect(screen.getByRole('progressbar')).toBeInTheDocument();
        });

        it('sets correct aria-valuenow for progress', () => {
            const nutrient = createMockNutrient({ optimalRecommendation: 100 });
            render(
                <NutrientDetailPage
                    nutrient={nutrient}
                    currentIntake={75}
                    onBack={mockOnBack}
                />
            );

            const progressbar = screen.getByRole('progressbar');
            expect(progressbar).toHaveAttribute('aria-valuenow', '75');
        });

        it('caps progress bar display at 100% even when exceeding', () => {
            const nutrient = createMockNutrient({ optimalRecommendation: 100 });
            render(
                <NutrientDetailPage
                    nutrient={nutrient}
                    currentIntake={150}
                    onBack={mockOnBack}
                />
            );

            // The aria-valuenow should show actual percentage
            const progressbar = screen.getByRole('progressbar');
            expect(progressbar).toHaveAttribute('aria-valuenow', '150');
        });

        it('displays green color for 80-100% progress', () => {
            const nutrient = createMockNutrient({ optimalRecommendation: 100 });
            const { container } = render(
                <NutrientDetailPage
                    nutrient={nutrient}
                    currentIntake={90}
                    onBack={mockOnBack}
                />
            );

            const progressFill = container.querySelector('.bg-green-500');
            expect(progressFill).toBeInTheDocument();
        });

        it('displays yellow color for 50-79% progress', () => {
            const nutrient = createMockNutrient({ optimalRecommendation: 100 });
            const { container } = render(
                <NutrientDetailPage
                    nutrient={nutrient}
                    currentIntake={60}
                    onBack={mockOnBack}
                />
            );

            const progressFill = container.querySelector('.bg-yellow-500');
            expect(progressFill).toBeInTheDocument();
        });

        it('displays red color for <50% progress', () => {
            const nutrient = createMockNutrient({ optimalRecommendation: 100 });
            const { container } = render(
                <NutrientDetailPage
                    nutrient={nutrient}
                    currentIntake={30}
                    onBack={mockOnBack}
                />
            );

            const progressFill = container.querySelector('.bg-red-500');
            expect(progressFill).toBeInTheDocument();
        });

        it('displays red color for >120% progress', () => {
            const nutrient = createMockNutrient({ optimalRecommendation: 100 });
            const { container } = render(
                <NutrientDetailPage
                    nutrient={nutrient}
                    currentIntake={130}
                    onBack={mockOnBack}
                />
            );

            const progressFill = container.querySelector('.bg-red-500');
            expect(progressFill).toBeInTheDocument();
        });
    });

    // ========================================================================
    // Weekly View Tests
    // ========================================================================

    describe('weekly view', () => {
        it('displays weekly indicator when isWeekly is true', () => {
            const nutrient = createMockNutrient();
            render(
                <NutrientDetailPage
                    nutrient={nutrient}
                    currentIntake={45}
                    isWeekly={true}
                    onBack={mockOnBack}
                />
            );

            expect(screen.getByText('(неделя)')).toBeInTheDocument();
        });

        it('does not display weekly indicator when isWeekly is false', () => {
            const nutrient = createMockNutrient();
            render(
                <NutrientDetailPage
                    nutrient={nutrient}
                    currentIntake={45}
                    isWeekly={false}
                    onBack={mockOnBack}
                />
            );

            expect(screen.queryByText('(неделя)')).not.toBeInTheDocument();
        });

        it('does not display weekly indicator by default', () => {
            const nutrient = createMockNutrient();
            render(
                <NutrientDetailPage
                    nutrient={nutrient}
                    currentIntake={45}
                    onBack={mockOnBack}
                />
            );

            expect(screen.queryByText('(неделя)')).not.toBeInTheDocument();
        });
    });

    // ========================================================================
    // Recommendations Section Tests
    // ========================================================================

    describe('recommendations section', () => {
        it('displays minimum recommendation in Russian', () => {
            const nutrient = createMockNutrient({
                minRecommendation: 60,
                unit: 'мг',
            });
            render(
                <NutrientDetailPage
                    nutrient={nutrient}
                    currentIntake={45}
                    onBack={mockOnBack}
                />
            );

            expect(screen.getByText(/Минимальная норма: 60 мг/)).toBeInTheDocument();
        });

        it('displays optimal recommendation in Russian', () => {
            const nutrient = createMockNutrient({
                optimalRecommendation: 90,
                unit: 'мг',
            });
            render(
                <NutrientDetailPage
                    nutrient={nutrient}
                    currentIntake={45}
                    onBack={mockOnBack}
                />
            );

            expect(screen.getByText(/Оптимальная норма: 90 мг/)).toBeInTheDocument();
        });
    });

    // ========================================================================
    // Number Formatting Tests
    // ========================================================================

    describe('number formatting', () => {
        it('displays integer values without decimals', () => {
            const nutrient = createMockNutrient({
                optimalRecommendation: 100,
                unit: 'мг',
            });
            render(
                <NutrientDetailPage
                    nutrient={nutrient}
                    currentIntake={50}
                    onBack={mockOnBack}
                />
            );

            expect(screen.getByText('50 / 100 мг')).toBeInTheDocument();
        });

        it('displays decimal values with one decimal place', () => {
            const nutrient = createMockNutrient({
                optimalRecommendation: 2.5,
                unit: 'мг',
            });
            render(
                <NutrientDetailPage
                    nutrient={nutrient}
                    currentIntake={1.5}
                    onBack={mockOnBack}
                />
            );

            expect(screen.getByText('1.5 / 2.5 мг')).toBeInTheDocument();
        });
    });

    // ========================================================================
    // Accessibility Tests
    // ========================================================================

    describe('accessibility', () => {
        it('has accessible progress bar label', () => {
            const nutrient = createMockNutrient({ name: 'Витамин C' });
            render(
                <NutrientDetailPage
                    nutrient={nutrient}
                    currentIntake={75}
                    onBack={mockOnBack}
                />
            );

            const progressbar = screen.getByRole('progressbar');
            expect(progressbar).toHaveAttribute(
                'aria-label',
                expect.stringContaining('Витамин C прогресс')
            );
        });

        it('has section with aria-label for progress', () => {
            const nutrient = createMockNutrient();
            render(
                <NutrientDetailPage
                    nutrient={nutrient}
                    currentIntake={45}
                    onBack={mockOnBack}
                />
            );

            expect(
                screen.getByRole('region', { name: 'Прогресс потребления' })
            ).toBeInTheDocument();
        });

        it('has section with aria-label for sources', () => {
            const nutrient = createMockNutrient();
            render(
                <NutrientDetailPage
                    nutrient={nutrient}
                    currentIntake={45}
                    onBack={mockOnBack}
                />
            );

            expect(
                screen.getByRole('region', { name: 'Источники в рационе' })
            ).toBeInTheDocument();
        });
    });

    // ========================================================================
    // Custom className Tests
    // ========================================================================

    describe('custom className', () => {
        it('applies custom className to container', () => {
            const nutrient = createMockNutrient();
            const { container } = render(
                <NutrientDetailPage
                    nutrient={nutrient}
                    currentIntake={45}
                    onBack={mockOnBack}
                    className="custom-class"
                />
            );

            expect(container.firstChild).toHaveClass('custom-class');
        });
    });
});
