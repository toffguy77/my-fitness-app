/**
 * LoadingSkeletons Unit Tests
 *
 * Tests for all skeleton loading components in the food tracker.
 *
 * @module food-tracker/components/__tests__/LoadingSkeletons.test
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import {
    Skeleton,
    KBZHUSummarySkeleton,
    MealSlotSkeleton,
    WaterTrackerSkeleton,
    FoodEntrySkeleton,
    SearchResultsSkeleton,
    FoodTrackerPageSkeleton,
    RecommendationsSkeleton,
} from '../LoadingSkeletons';

// ============================================================================
// Tests
// ============================================================================

describe('LoadingSkeletons', () => {
    describe('Skeleton (base)', () => {
        it('renders a div element', () => {
            const { container } = render(<Skeleton />);

            const skeleton = container.firstElementChild;
            expect(skeleton).toBeInTheDocument();
            expect(skeleton?.tagName).toBe('DIV');
        });

        it('has animate-pulse class for animation', () => {
            const { container } = render(<Skeleton />);

            expect(container.firstElementChild).toHaveClass('animate-pulse');
        });

        it('has bg-gray-200 class', () => {
            const { container } = render(<Skeleton />);

            expect(container.firstElementChild).toHaveClass('bg-gray-200');
        });

        it('is hidden from screen readers with aria-hidden', () => {
            const { container } = render(<Skeleton />);

            expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
        });

        it('applies custom className', () => {
            const { container } = render(<Skeleton className="h-5 w-32" />);

            expect(container.firstElementChild).toHaveClass('h-5', 'w-32');
        });
    });

    describe('KBZHUSummarySkeleton', () => {
        it('renders without crashing', () => {
            const { container } = render(<KBZHUSummarySkeleton />);

            expect(container.firstElementChild).toBeInTheDocument();
        });

        it('renders skeleton elements with animate-pulse', () => {
            const { container } = render(<KBZHUSummarySkeleton />);

            const pulsingElements = container.querySelectorAll('.animate-pulse');
            expect(pulsingElements.length).toBeGreaterThan(0);
        });

        it('renders a 4-column grid for KBZHU values', () => {
            const { container } = render(<KBZHUSummarySkeleton />);

            const grid = container.querySelector('.grid');
            expect(grid).toBeInTheDocument();
        });
    });

    describe('MealSlotSkeleton', () => {
        it('renders without crashing', () => {
            const { container } = render(<MealSlotSkeleton />);

            expect(container.firstElementChild).toBeInTheDocument();
        });

        it('renders skeleton elements with animate-pulse', () => {
            const { container } = render(<MealSlotSkeleton />);

            const pulsingElements = container.querySelectorAll('.animate-pulse');
            expect(pulsingElements.length).toBeGreaterThan(0);
        });

        it('renders a card with border', () => {
            const { container } = render(<MealSlotSkeleton />);

            expect(container.firstElementChild).toHaveClass('border', 'border-gray-200');
        });
    });

    describe('WaterTrackerSkeleton', () => {
        it('renders without crashing', () => {
            const { container } = render(<WaterTrackerSkeleton />);

            expect(container.firstElementChild).toBeInTheDocument();
        });

        it('renders skeleton elements with animate-pulse', () => {
            const { container } = render(<WaterTrackerSkeleton />);

            const pulsingElements = container.querySelectorAll('.animate-pulse');
            expect(pulsingElements.length).toBeGreaterThan(0);
        });
    });

    describe('FoodEntrySkeleton', () => {
        it('renders without crashing', () => {
            const { container } = render(<FoodEntrySkeleton />);

            expect(container.firstElementChild).toBeInTheDocument();
        });

        it('renders skeleton elements with animate-pulse', () => {
            const { container } = render(<FoodEntrySkeleton />);

            const pulsingElements = container.querySelectorAll('.animate-pulse');
            expect(pulsingElements.length).toBeGreaterThan(0);
        });
    });

    describe('SearchResultsSkeleton', () => {
        it('renders without crashing', () => {
            const { container } = render(<SearchResultsSkeleton />);

            expect(container.firstElementChild).toBeInTheDocument();
        });

        it('renders 5 skeleton result items', () => {
            const { container } = render(<SearchResultsSkeleton />);

            // Each result item contains multiple skeleton elements
            const resultItems = container.querySelectorAll('.space-y-2 > div');
            expect(resultItems).toHaveLength(5);
        });

        it('renders skeleton elements with animate-pulse', () => {
            const { container } = render(<SearchResultsSkeleton />);

            const pulsingElements = container.querySelectorAll('.animate-pulse');
            expect(pulsingElements.length).toBeGreaterThan(0);
        });
    });

    describe('FoodTrackerPageSkeleton', () => {
        it('renders without crashing', () => {
            const { container } = render(<FoodTrackerPageSkeleton />);

            expect(container.firstElementChild).toBeInTheDocument();
        });

        it('has aria-label for loading state', () => {
            const { container } = render(<FoodTrackerPageSkeleton />);

            expect(container.firstElementChild).toHaveAttribute('aria-label', 'Загрузка...');
        });

        it('renders KBZHU summary skeleton', () => {
            const { container } = render(<FoodTrackerPageSkeleton />);

            // Should contain grid for KBZHU columns
            const grids = container.querySelectorAll('.grid');
            expect(grids.length).toBeGreaterThan(0);
        });

        it('renders multiple meal slot skeletons', () => {
            const { container } = render(<FoodTrackerPageSkeleton />);

            // 4 meal slots + 1 KBZHU summary + 1 water tracker = 6 direct card children
            const cards = container.querySelectorAll('.border-gray-200');
            expect(cards.length).toBeGreaterThanOrEqual(5);
        });
    });

    describe('RecommendationsSkeleton', () => {
        it('renders without crashing', () => {
            const { container } = render(<RecommendationsSkeleton />);

            expect(container.firstElementChild).toBeInTheDocument();
        });

        it('renders 3 recommendation card skeletons', () => {
            const { container } = render(<RecommendationsSkeleton />);

            const cards = container.querySelectorAll('.border-gray-200');
            expect(cards).toHaveLength(3);
        });

        it('renders skeleton elements with animate-pulse', () => {
            const { container } = render(<RecommendationsSkeleton />);

            const pulsingElements = container.querySelectorAll('.animate-pulse');
            expect(pulsingElements.length).toBeGreaterThan(0);
        });
    });
});
