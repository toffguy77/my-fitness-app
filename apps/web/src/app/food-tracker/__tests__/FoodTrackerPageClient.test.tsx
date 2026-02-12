/**
 * Unit tests for FoodTrackerPageClient
 */

import { render, screen, waitFor } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import { FoodTrackerPageClient } from '../FoodTrackerPageClient';

// Mock next/navigation
jest.mock('next/navigation', () => ({
    useRouter: jest.fn(),
}));

// Mock FoodTrackerPage component
jest.mock('@/features/food-tracker/components/FoodTrackerPage', () => ({
    FoodTrackerPage: () => <div data-testid="food-tracker-page">Food Tracker Page</div>,
}));

// Mock localStorage
const mockLocalStorage = (() => {
    let store: Record<string, string> = {};
    return {
        getItem: jest.fn((key: string) => store[key] || null),
        setItem: jest.fn((key: string, value: string) => {
            store[key] = value;
        }),
        removeItem: jest.fn((key: string) => {
            delete store[key];
        }),
        clear: jest.fn(() => {
            store = {};
        }),
    };
})();

Object.defineProperty(window, 'localStorage', {
    value: mockLocalStorage,
});

describe('FoodTrackerPageClient', () => {
    const mockPush = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
        mockLocalStorage.clear();
        (useRouter as jest.Mock).mockReturnValue({
            push: mockPush,
        });
    });

    describe('authentication', () => {
        it('redirects to /auth when no token', async () => {
            mockLocalStorage.getItem.mockReturnValue(null);

            render(<FoodTrackerPageClient />);

            await waitFor(() => {
                expect(mockPush).toHaveBeenCalledWith('/auth');
            });
        });

        it('redirects to /auth when no user data', async () => {
            mockLocalStorage.getItem.mockImplementation((key: string) => {
                if (key === 'auth_token') return 'valid-token';
                return null;
            });

            render(<FoodTrackerPageClient />);

            await waitFor(() => {
                expect(mockPush).toHaveBeenCalledWith('/auth');
            });
        });

        it('redirects to /auth when user data is invalid JSON', async () => {
            mockLocalStorage.getItem.mockImplementation((key: string) => {
                if (key === 'auth_token') return 'valid-token';
                if (key === 'user') return 'invalid-json';
                return null;
            });

            render(<FoodTrackerPageClient />);

            await waitFor(() => {
                expect(mockPush).toHaveBeenCalledWith('/auth');
            });
        });

        it('renders FoodTrackerPage when authenticated', async () => {
            const userData = { id: '1', email: 'test@example.com', name: 'Test User' };
            mockLocalStorage.getItem.mockImplementation((key: string) => {
                if (key === 'auth_token') return 'valid-token';
                if (key === 'user') return JSON.stringify(userData);
                return null;
            });

            render(<FoodTrackerPageClient />);

            await waitFor(() => {
                expect(screen.getByTestId('food-tracker-page')).toBeInTheDocument();
            });
        });
    });

    describe('loading state', () => {
        it('shows loading indicator while checking auth', () => {
            mockLocalStorage.getItem.mockReturnValue(null);

            render(<FoodTrackerPageClient />);

            expect(screen.getByText('Загрузка...')).toBeInTheDocument();
        });

        it('shows loading spinner', () => {
            mockLocalStorage.getItem.mockReturnValue(null);

            const { container } = render(<FoodTrackerPageClient />);

            expect(container.querySelector('.animate-spin')).toBeInTheDocument();
        });
    });
});
