/**
 * NutrientDetailPageClient Unit Tests
 *
 * Tests for the client-side nutrient detail page wrapper.
 *
 * @module app/food-tracker/nutrient/[id]/__tests__/NutrientDetailPageClient.test
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NutrientDetailPageClient } from '../NutrientDetailPageClient';

// ============================================================================
// Mocks
// ============================================================================

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('next/navigation', () => ({
    useRouter: () => ({
        push: mockPush,
        back: mockBack,
    }),
}));

jest.mock('@/features/food-tracker/components/NutrientDetailPage', () => ({
    NutrientDetailPage: ({
        nutrient,
        currentIntake,
        onBack,
    }: {
        nutrient: { name: string };
        currentIntake: number;
        onBack: () => void;
    }) => (
        <div data-testid="nutrient-detail-page">
            <span data-testid="nutrient-name">{nutrient.name}</span>
            <span data-testid="current-intake">{currentIntake}</span>
            <button onClick={onBack}>Назад</button>
        </div>
    ),
}));

jest.mock('lucide-react', () => ({
    ArrowLeft: ({ className }: { className?: string }) => (
        <span data-testid="arrow-left" className={className}>←</span>
    ),
    Info: ({ className }: { className?: string }) => (
        <span data-testid="info-icon" className={className}>i</span>
    ),
    Heart: ({ className }: { className?: string }) => (
        <span data-testid="heart-icon" className={className}>♥</span>
    ),
    Utensils: ({ className }: { className?: string }) => (
        <span data-testid="utensils-icon" className={className}>🍴</span>
    ),
}));

// ============================================================================
// Helpers
// ============================================================================

function setAuthToken(token: string | null): void {
    if (token) {
        localStorage.setItem('auth_token', token);
    } else {
        localStorage.removeItem('auth_token');
    }
}

// ============================================================================
// Tests
// ============================================================================

describe('NutrientDetailPageClient', () => {
    beforeEach(() => {
        mockPush.mockClear();
        mockBack.mockClear();
        localStorage.clear();
    });

    describe('Authentication', () => {
        it('redirects to /auth when no token is present', async () => {
            setAuthToken(null);

            render(<NutrientDetailPageClient nutrientId="vitamin-d" />);

            await waitFor(() => {
                expect(mockPush).toHaveBeenCalledWith('/auth');
            });
        });

        it('does not redirect when token is present', async () => {
            setAuthToken('valid-token');

            render(<NutrientDetailPageClient nutrientId="vitamin-d" />);

            await waitFor(() => {
                expect(mockPush).not.toHaveBeenCalled();
            });
        });
    });

    describe('Loading State', () => {
        it('shows loading spinner initially', () => {
            setAuthToken(null);

            render(<NutrientDetailPageClient nutrientId="vitamin-d" />);

            expect(screen.getByText('Загрузка...')).toBeInTheDocument();
        });
    });

    describe('Known Nutrient', () => {
        it('renders NutrientDetailPage for vitamin-d', async () => {
            setAuthToken('valid-token');

            render(<NutrientDetailPageClient nutrientId="vitamin-d" />);

            await waitFor(() => {
                expect(screen.getByTestId('nutrient-detail-page')).toBeInTheDocument();
            });

            expect(screen.getByTestId('nutrient-name')).toHaveTextContent('Витамин D');
        });

        it('renders NutrientDetailPage for vitamin-c', async () => {
            setAuthToken('valid-token');

            render(<NutrientDetailPageClient nutrientId="vitamin-c" />);

            await waitFor(() => {
                expect(screen.getByTestId('nutrient-name')).toHaveTextContent('Витамин C');
            });
        });

        it('calculates current intake from sources', async () => {
            setAuthToken('valid-token');

            render(<NutrientDetailPageClient nutrientId="vitamin-d" />);

            await waitFor(() => {
                // vitamin-d sources: 15 + 3 + 2.5 = 20.5
                expect(screen.getByTestId('current-intake')).toHaveTextContent('20.5');
            });
        });
    });

    describe('Unknown Nutrient', () => {
        it('shows "not found" message for unknown nutrient', async () => {
            setAuthToken('valid-token');

            render(<NutrientDetailPageClient nutrientId="nonexistent" />);

            await waitFor(() => {
                expect(screen.getByText('Нутриент не найден')).toBeInTheDocument();
            });
        });

        it('shows back link on not-found page', async () => {
            setAuthToken('valid-token');

            render(<NutrientDetailPageClient nutrientId="nonexistent" />);

            await waitFor(() => {
                expect(screen.getByText(/Вернуться назад/)).toBeInTheDocument();
            });
        });

        it('navigates back when back link is clicked', async () => {
            const user = userEvent.setup();
            setAuthToken('valid-token');

            render(<NutrientDetailPageClient nutrientId="nonexistent" />);

            await waitFor(() => {
                expect(screen.getByText(/Вернуться назад/)).toBeInTheDocument();
            });

            await user.click(screen.getByText(/Вернуться назад/));

            expect(mockBack).toHaveBeenCalledTimes(1);
        });
    });

    describe('Navigation', () => {
        it('calls router.back when back button is clicked on detail page', async () => {
            const user = userEvent.setup();
            setAuthToken('valid-token');

            render(<NutrientDetailPageClient nutrientId="vitamin-d" />);

            await waitFor(() => {
                expect(screen.getByTestId('nutrient-detail-page')).toBeInTheDocument();
            });

            await user.click(screen.getByText('Назад'));

            expect(mockBack).toHaveBeenCalledTimes(1);
        });
    });
});
