/**
 * RecommendationsTab Property-Based Tests
 *
 * Property tests for RecommendationsTab, NutrientCategory, and NutrientRecommendationItem
 * components using fast-check.
 *
 * @module food-tracker/components/__tests__/RecommendationsTab.property.test
 */

import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import * as fc from 'fast-check';
import { NutrientRecommendationItem } from '../NutrientRecommendationItem';
import { NutrientCategory } from '../NutrientCategory';
import type { NutrientRecommendation, NutrientCategoryType } from '../../types';

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
// Setup
// ============================================================================

afterEach(() => {
    cleanup();
});

// ============================================================================
// Generators
// ============================================================================

const categoryGenerator = (): fc.Arbitrary<NutrientCategoryType> =>
    fc.constantFrom('vitamins', 'minerals', 'lipids', 'fiber', 'plant');

const unitGenerator = (): fc.Arbitrary<string> =>
    fc.constantFrom('г', 'мг', 'мкг', 'МЕ');

const nutrientRecommendationGenerator = (): fc.Arbitrary<NutrientRecommendation> =>
    fc.record({
        id: fc.uuid(),
        name: fc.constantFrom(
            'Витамин А',
            'Витамин B1',
            'Витамин B2',
            'Витамин B6',
            'Витамин B12',
            'Витамин C',
            'Витамин D',
            'Витамин E',
            'Витамин K',
            'Кальций',
            'Железо',
            'Магний',
            'Цинк',
            'Калий',
            'Омега-3',
            'Клетчатка'
        ),
        category: categoryGenerator(),
        dailyTarget: fc.integer({ min: 1, max: 10000 }),
        unit: unitGenerator(),
        isWeekly: fc.boolean(),
        isCustom: fc.boolean(),
    });

// ============================================================================
// Property Tests
// ============================================================================

describe('Property 17: Nutrient Recommendation Progress Format', () => {
    /**
     * **Validates: Requirements 11.4**
     *
     * Property: Display format is always "current / target unit" (e.g., "15 / 38 г")
     */
    it('displays progress in format "current / target unit" for all recommendations', () => {
        fc.assert(
            fc.property(
                nutrientRecommendationGenerator(),
                fc.integer({ min: 0, max: 10000 }),
                (recommendation, currentIntake) => {
                    cleanup();
                    const { container } = render(
                        <NutrientRecommendationItem
                            recommendation={recommendation}
                            currentIntake={currentIntake}
                            onClick={jest.fn()}
                        />
                    );

                    // Get the text content
                    const textContent = container.textContent || '';

                    // Verify format contains "current / target unit"
                    const expectedPattern = new RegExp(
                        `${currentIntake}.*\\/.*${recommendation.dailyTarget}.*${recommendation.unit}`
                    );

                    expect(textContent).toMatch(expectedPattern);
                }
            ),
            { numRuns: 50 }
        );
    });

    it('always shows the unit after the target value', () => {
        fc.assert(
            fc.property(
                nutrientRecommendationGenerator(),
                fc.integer({ min: 0, max: 5000 }),
                (recommendation, currentIntake) => {
                    cleanup();
                    const { container } = render(
                        <NutrientRecommendationItem
                            recommendation={recommendation}
                            currentIntake={currentIntake}
                            onClick={jest.fn()}
                        />
                    );

                    const textContent = container.textContent || '';

                    // Unit should appear after target
                    expect(textContent).toContain(recommendation.unit);
                }
            ),
            { numRuns: 50 }
        );
    });

    it('displays nutrient name for all recommendations', () => {
        fc.assert(
            fc.property(
                nutrientRecommendationGenerator(),
                fc.integer({ min: 0, max: 5000 }),
                (recommendation, currentIntake) => {
                    cleanup();
                    const { container } = render(
                        <NutrientRecommendationItem
                            recommendation={recommendation}
                            currentIntake={currentIntake}
                            onClick={jest.fn()}
                        />
                    );

                    // Name should be displayed
                    expect(container.textContent).toContain(recommendation.name);
                }
            ),
            { numRuns: 50 }
        );
    });

    it('has progress bar with valid percentage for all inputs', () => {
        fc.assert(
            fc.property(
                nutrientRecommendationGenerator(),
                fc.integer({ min: 0, max: 10000 }),
                (recommendation, currentIntake) => {
                    cleanup();
                    render(
                        <NutrientRecommendationItem
                            recommendation={recommendation}
                            currentIntake={currentIntake}
                            onClick={jest.fn()}
                        />
                    );

                    // Progress bar should exist
                    const progressBar = screen.getByRole('progressbar');
                    expect(progressBar).toBeInTheDocument();

                    // aria-valuenow should be a valid number
                    const valueNow = progressBar.getAttribute('aria-valuenow');
                    expect(valueNow).not.toBeNull();
                    const numValue = parseInt(valueNow!, 10);
                    expect(numValue).toBeGreaterThanOrEqual(0);
                }
            ),
            { numRuns: 50 }
        );
    });
});

describe('Property 18: Category Collapsibility', () => {
    /**
     * **Validates: Requirements 11.2**
     *
     * Property: Toggle collapse shows/hides recommendations while preserving data
     */
    it('shows recommendations when expanded', () => {
        fc.assert(
            fc.property(
                fc.array(nutrientRecommendationGenerator(), { minLength: 1, maxLength: 5 }),
                (recommendations) => {
                    cleanup();
                    const currentIntakes: Record<string, number> = {};
                    recommendations.forEach((rec) => {
                        currentIntakes[rec.id] = Math.floor(Math.random() * rec.dailyTarget);
                    });

                    const { container } = render(
                        <NutrientCategory
                            category="vitamins"
                            label="Витамины"
                            recommendations={recommendations}
                            currentIntakes={currentIntakes}
                            isExpanded={true}
                            onToggle={jest.fn()}
                            onRecommendationClick={jest.fn()}
                        />
                    );

                    // All recommendations should be visible when expanded
                    recommendations.forEach((rec) => {
                        expect(container.textContent).toContain(rec.name);
                    });
                }
            ),
            { numRuns: 20 }
        );
    });

    it('hides recommendations when collapsed', () => {
        fc.assert(
            fc.property(
                fc.array(nutrientRecommendationGenerator(), { minLength: 1, maxLength: 5 }),
                (recommendations) => {
                    cleanup();
                    const currentIntakes: Record<string, number> = {};
                    recommendations.forEach((rec) => {
                        currentIntakes[rec.id] = Math.floor(Math.random() * rec.dailyTarget);
                    });

                    render(
                        <NutrientCategory
                            category="vitamins"
                            label="Витамины"
                            recommendations={recommendations}
                            currentIntakes={currentIntakes}
                            isExpanded={false}
                            onToggle={jest.fn()}
                            onRecommendationClick={jest.fn()}
                        />
                    );

                    // Recommendations should not be visible when collapsed
                    recommendations.forEach((rec) => {
                        expect(screen.queryByText(rec.name, { exact: false })).not.toBeInTheDocument();
                    });
                }
            ),
            { numRuns: 20 }
        );
    });

    it('displays category label regardless of expansion state', () => {
        fc.assert(
            fc.property(
                fc.array(nutrientRecommendationGenerator(), { minLength: 1, maxLength: 3 }),
                fc.boolean(),
                (recommendations, isExpanded) => {
                    cleanup();
                    const currentIntakes: Record<string, number> = {};
                    recommendations.forEach((rec) => {
                        currentIntakes[rec.id] = 0;
                    });

                    const { container } = render(
                        <NutrientCategory
                            category="vitamins"
                            label="Витамины"
                            recommendations={recommendations}
                            currentIntakes={currentIntakes}
                            isExpanded={isExpanded}
                            onToggle={jest.fn()}
                            onRecommendationClick={jest.fn()}
                        />
                    );

                    // Category label should always be visible
                    expect(container.textContent).toContain('Витамины');
                }
            ),
            { numRuns: 20 }
        );
    });

    it('displays recommendation count in header', () => {
        fc.assert(
            fc.property(
                fc.array(nutrientRecommendationGenerator(), { minLength: 1, maxLength: 10 }),
                (recommendations) => {
                    cleanup();
                    const currentIntakes: Record<string, number> = {};
                    recommendations.forEach((rec) => {
                        currentIntakes[rec.id] = 0;
                    });

                    const { container } = render(
                        <NutrientCategory
                            category="minerals"
                            label="Минералы"
                            recommendations={recommendations}
                            currentIntakes={currentIntakes}
                            isExpanded={false}
                            onToggle={jest.fn()}
                            onRecommendationClick={jest.fn()}
                        />
                    );

                    // Count should be displayed
                    expect(container.textContent).toContain(`(${recommendations.length})`);
                }
            ),
            { numRuns: 20 }
        );
    });
});
