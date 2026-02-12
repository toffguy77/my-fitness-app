/**
 * Unit tests for useFoodSearch hook
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useFoodSearch } from '../useFoodSearch';
import { apiClient } from '@/shared/utils/api-client';
import type { FoodItem } from '../../types';

// Mock API client
jest.mock('@/shared/utils/api-client', () => ({
    apiClient: {
        get: jest.fn(),
    },
}));

// Mock config
jest.mock('@/config/api', () => ({
    getApiUrl: (path: string) => `http://localhost:4000${path}`,
}));

describe('useFoodSearch', () => {
    const mockFoodItems: FoodItem[] = [
        {
            id: '1',
            name: 'Яблоко',
            category: 'Фрукты',
            servingSize: 100,
            servingUnit: 'г',
            nutritionPer100: { calories: 52, protein: 0.3, fat: 0.2, carbs: 14 },
            source: 'database',
            verified: true,
        },
        {
            id: '2',
            name: 'Яблочный сок',
            category: 'Напитки',
            servingSize: 200,
            servingUnit: 'мл',
            nutritionPer100: { calories: 46, protein: 0.1, fat: 0.1, carbs: 11 },
            source: 'database',
            verified: true,
        },
    ];

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('initialization', () => {
        it('initializes with empty query', () => {
            const { result } = renderHook(() => useFoodSearch({ autoLoadRecent: false }));

            expect(result.current.query).toBe('');
        });

        it('initializes with empty results', () => {
            const { result } = renderHook(() => useFoodSearch({ autoLoadRecent: false }));

            expect(result.current.results).toEqual([]);
        });

        it('initializes with isSearching false', () => {
            const { result } = renderHook(() => useFoodSearch({ autoLoadRecent: false }));

            expect(result.current.isSearching).toBe(false);
        });

        it('initializes with no error', () => {
            const { result } = renderHook(() => useFoodSearch({ autoLoadRecent: false }));

            expect(result.current.error).toBeNull();
        });
    });

    describe('setQuery', () => {
        it('updates query state immediately', () => {
            const { result } = renderHook(() => useFoodSearch({ autoLoadRecent: false }));

            act(() => {
                result.current.setQuery('яблоко');
            });

            expect(result.current.query).toBe('яблоко');
        });

        it('clears results when query is too short', () => {
            const { result } = renderHook(() =>
                useFoodSearch({ autoLoadRecent: false, minQueryLength: 2 })
            );

            // First set a valid query
            act(() => {
                result.current.setQuery('яб');
            });

            // Then set a short query
            act(() => {
                result.current.setQuery('я');
            });

            expect(result.current.results).toEqual([]);
        });

        it('triggers search after debounce delay', async () => {
            (apiClient.get as unknown as jest.Mock).mockResolvedValue({
                items: mockFoodItems,
                total: 2,
            });

            const { result } = renderHook(() =>
                useFoodSearch({ autoLoadRecent: false, debounceMs: 300 })
            );

            act(() => {
                result.current.setQuery('яблоко');
            });

            // Search should not be called immediately
            expect(apiClient.get).not.toHaveBeenCalled();

            // Advance timers past debounce delay
            await act(async () => {
                jest.advanceTimersByTime(300);
            });

            expect(apiClient.get).toHaveBeenCalled();
        });
    });

    describe('searchNow', () => {
        it('searches immediately without debounce', async () => {
            (apiClient.get as unknown as jest.Mock).mockResolvedValue({
                items: mockFoodItems,
                total: 2,
            });

            const { result } = renderHook(() => useFoodSearch({ autoLoadRecent: false }));

            await act(async () => {
                await result.current.searchNow('яблоко');
            });

            expect(apiClient.get).toHaveBeenCalled();
            expect(result.current.results).toEqual(mockFoodItems);
        });

        it('updates query state', async () => {
            (apiClient.get as unknown as jest.Mock).mockResolvedValue({
                items: [],
                total: 0,
            });

            const { result } = renderHook(() => useFoodSearch({ autoLoadRecent: false }));

            await act(async () => {
                await result.current.searchNow('банан');
            });

            expect(result.current.query).toBe('банан');
        });

        it('does not search if query is too short', async () => {
            const { result } = renderHook(() =>
                useFoodSearch({ autoLoadRecent: false, minQueryLength: 2 })
            );

            await act(async () => {
                await result.current.searchNow('я');
            });

            expect(apiClient.get).not.toHaveBeenCalled();
        });
    });

    describe('clearSearch', () => {
        it('clears query', async () => {
            (apiClient.get as unknown as jest.Mock).mockResolvedValue({
                items: mockFoodItems,
                total: 2,
            });

            const { result } = renderHook(() => useFoodSearch({ autoLoadRecent: false }));

            await act(async () => {
                await result.current.searchNow('яблоко');
            });

            act(() => {
                result.current.clearSearch();
            });

            expect(result.current.query).toBe('');
        });

        it('clears results', async () => {
            (apiClient.get as unknown as jest.Mock).mockResolvedValue({
                items: mockFoodItems,
                total: 2,
            });

            const { result } = renderHook(() => useFoodSearch({ autoLoadRecent: false }));

            await act(async () => {
                await result.current.searchNow('яблоко');
            });

            act(() => {
                result.current.clearSearch();
            });

            expect(result.current.results).toEqual([]);
        });

        it('clears error', async () => {
            (apiClient.get as unknown as jest.Mock).mockRejectedValue(new Error('Network error'));

            const { result } = renderHook(() => useFoodSearch({ autoLoadRecent: false }));

            await act(async () => {
                await result.current.searchNow('яблоко');
            });

            act(() => {
                result.current.clearSearch();
            });

            expect(result.current.error).toBeNull();
        });
    });

    describe('loadRecentFoods', () => {
        it('loads recent foods from API', async () => {
            (apiClient.get as unknown as jest.Mock).mockResolvedValue({
                items: mockFoodItems,
            });

            const { result } = renderHook(() => useFoodSearch({ autoLoadRecent: false }));

            await act(async () => {
                await result.current.loadRecentFoods();
            });

            expect(result.current.recentFoods).toEqual(mockFoodItems);
        });

        it('handles API error gracefully', async () => {
            (apiClient.get as unknown as jest.Mock).mockRejectedValue(new Error('Network error'));

            const { result } = renderHook(() => useFoodSearch({ autoLoadRecent: false }));

            await act(async () => {
                await result.current.loadRecentFoods();
            });

            // Should not throw, just set empty array
            expect(result.current.recentFoods).toEqual([]);
        });
    });

    describe('loadFavoriteFoods', () => {
        it('loads favorite foods from API', async () => {
            (apiClient.get as unknown as jest.Mock).mockResolvedValue({
                items: mockFoodItems,
            });

            const { result } = renderHook(() => useFoodSearch({ autoLoadRecent: false }));

            await act(async () => {
                await result.current.loadFavoriteFoods();
            });

            expect(result.current.favoriteFoods).toEqual(mockFoodItems);
        });

        it('handles API error gracefully', async () => {
            (apiClient.get as unknown as jest.Mock).mockRejectedValue(new Error('Network error'));

            const { result } = renderHook(() => useFoodSearch({ autoLoadRecent: false }));

            await act(async () => {
                await result.current.loadFavoriteFoods();
            });

            // Should not throw, just set empty array
            expect(result.current.favoriteFoods).toEqual([]);
        });
    });

    describe('error handling', () => {
        it('sets Russian error message on search failure', async () => {
            (apiClient.get as unknown as jest.Mock).mockRejectedValue(new Error('Network error'));

            const { result } = renderHook(() => useFoodSearch({ autoLoadRecent: false }));

            await act(async () => {
                await result.current.searchNow('яблоко');
            });

            expect(result.current.error).toBe('Ошибка при поиске продуктов');
        });

        it('clears results on error', async () => {
            (apiClient.get as unknown as jest.Mock).mockRejectedValue(new Error('Network error'));

            const { result } = renderHook(() => useFoodSearch({ autoLoadRecent: false }));

            await act(async () => {
                await result.current.searchNow('яблоко');
            });

            expect(result.current.results).toEqual([]);
        });
    });

    describe('pagination', () => {
        it('sets hasMore based on total results', async () => {
            (apiClient.get as unknown as jest.Mock).mockResolvedValue({
                items: mockFoodItems,
                total: 50, // More than page size
            });

            const { result } = renderHook(() =>
                useFoodSearch({ autoLoadRecent: false, pageSize: 20 })
            );

            await act(async () => {
                await result.current.searchNow('яблоко');
            });

            expect(result.current.hasMore).toBe(true);
        });

        it('sets hasMore to false when all results loaded', async () => {
            (apiClient.get as unknown as jest.Mock).mockResolvedValue({
                items: mockFoodItems,
                total: 2, // Same as items length
            });

            const { result } = renderHook(() =>
                useFoodSearch({ autoLoadRecent: false, pageSize: 20 })
            );

            await act(async () => {
                await result.current.searchNow('яблоко');
            });

            expect(result.current.hasMore).toBe(false);
        });

        it('updates totalResults', async () => {
            (apiClient.get as unknown as jest.Mock).mockResolvedValue({
                items: mockFoodItems,
                total: 100,
            });

            const { result } = renderHook(() => useFoodSearch({ autoLoadRecent: false }));

            await act(async () => {
                await result.current.searchNow('яблоко');
            });

            expect(result.current.totalResults).toBe(100);
        });
    });
});
