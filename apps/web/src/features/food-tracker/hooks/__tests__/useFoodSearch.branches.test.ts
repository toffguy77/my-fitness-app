/**
 * useFoodSearch Branch Coverage Tests
 *
 * Targets uncovered branches: abort errors, pagination (loadMore),
 * debounce timer cleanup, autoLoadRecent, searchNow with short query,
 * and page > 0 appending logic.
 *
 * @module food-tracker/hooks/__tests__/useFoodSearch.branches.test
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useFoodSearch } from '../useFoodSearch';
import { apiClient } from '@/shared/utils/api-client';
import type { FoodItem } from '../../types';

// ============================================================================
// Mocks
// ============================================================================

jest.mock('@/shared/utils/api-client', () => ({
    apiClient: {
        get: jest.fn(),
    },
}));

jest.mock('@/config/api', () => ({
    getApiUrl: (path: string) => `http://localhost:4000${path}`,
}));

const mockApiGet = apiClient.get as jest.Mock;

function makeFoodItems(count: number): FoodItem[] {
    return Array.from({ length: count }, (_, i) => ({
        id: `food-${i}`,
        name: `Продукт ${i}`,
        category: 'Общее',
        servingSize: 100,
        servingUnit: 'г',
        nutritionPer100: { calories: 100 + i, protein: 10, fat: 5, carbs: 15 },
        source: 'database' as const,
        verified: true,
    }));
}

// ============================================================================
// Tests
// ============================================================================

describe('useFoodSearch Branch Coverage', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    // -------------------------------------------------------------------------
    // Abort error handling (line 174)
    // -------------------------------------------------------------------------
    describe('Abort error handling', () => {
        it('ignores AbortError when request is cancelled', async () => {
            const abortError = new DOMException('Aborted', 'AbortError');
            mockApiGet.mockRejectedValueOnce(abortError);

            const { result } = renderHook(() =>
                useFoodSearch({ autoLoadRecent: false })
            );

            await act(async () => {
                await result.current.searchNow('яблоко');
            });

            // Should NOT set error for AbortError
            expect(result.current.error).toBeNull();
            // Results should not be cleared to empty on abort
        });

        it('sets error for non-abort errors', async () => {
            mockApiGet.mockRejectedValueOnce(new Error('Network error'));

            const { result } = renderHook(() =>
                useFoodSearch({ autoLoadRecent: false })
            );

            await act(async () => {
                await result.current.searchNow('яблоко');
            });

            expect(result.current.error).toBe('Ошибка при поиске продуктов');
            expect(result.current.results).toEqual([]);
            expect(result.current.hasMore).toBe(false);
        });
    });

    // -------------------------------------------------------------------------
    // loadMore branches (lines 288-292)
    // -------------------------------------------------------------------------
    describe('loadMore', () => {
        it('does not load when isSearching is true', async () => {
            // Make the initial search hang
            let resolveSearch: (v: any) => void;
            mockApiGet.mockImplementation(() => new Promise((r) => { resolveSearch = r; }));

            const { result } = renderHook(() =>
                useFoodSearch({ autoLoadRecent: false, pageSize: 5 })
            );

            // Start a search that will keep isSearching=true
            act(() => {
                result.current.setQuery('яблоко');
            });
            await act(async () => {
                jest.advanceTimersByTime(300);
            });

            // Try loadMore while searching
            await act(async () => {
                await result.current.loadMore();
            });

            // Should not have made additional API call (only the search one)
            expect(mockApiGet).toHaveBeenCalledTimes(1);

            // Cleanup: resolve the hanging promise
            await act(async () => {
                resolveSearch!({ items: [], total: 0 });
            });
        });

        it('does not load when query is too short', async () => {
            const { result } = renderHook(() =>
                useFoodSearch({ autoLoadRecent: false, minQueryLength: 3 })
            );

            act(() => {
                result.current.setQuery('яб');
            });

            await act(async () => {
                await result.current.loadMore();
            });

            expect(mockApiGet).not.toHaveBeenCalled();
        });

        it('loads next page and appends results', async () => {
            const page1Items = makeFoodItems(5);
            mockApiGet.mockResolvedValueOnce({ items: page1Items, total: 10 });

            const { result } = renderHook(() =>
                useFoodSearch({ autoLoadRecent: false, pageSize: 5 })
            );

            // Initial search
            await act(async () => {
                await result.current.searchNow('продукт');
            });

            expect(result.current.results).toHaveLength(5);
            expect(result.current.hasMore).toBe(true);

            // Load more
            const page2Items = makeFoodItems(5);
            mockApiGet.mockResolvedValueOnce({ items: page2Items, total: 10 });

            await act(async () => {
                await result.current.loadMore();
            });

            // Should have appended results
            expect(result.current.results).toHaveLength(10);
        });

        it('does not load when hasMore is false', async () => {
            mockApiGet.mockResolvedValueOnce({ items: makeFoodItems(2), total: 2 });

            const { result } = renderHook(() =>
                useFoodSearch({ autoLoadRecent: false, pageSize: 5 })
            );

            await act(async () => {
                await result.current.searchNow('продукт');
            });

            expect(result.current.hasMore).toBe(false);

            await act(async () => {
                await result.current.loadMore();
            });

            // No additional call
            expect(mockApiGet).toHaveBeenCalledTimes(1);
        });
    });

    // -------------------------------------------------------------------------
    // autoLoadRecent branch (line 134)
    // -------------------------------------------------------------------------
    describe('autoLoadRecent', () => {
        it('loads recent foods on mount when autoLoadRecent is true', async () => {
            mockApiGet.mockResolvedValue({ items: makeFoodItems(3) });

            renderHook(() => useFoodSearch({ autoLoadRecent: true }));

            await waitFor(() => {
                expect(mockApiGet).toHaveBeenCalledWith(
                    expect.stringContaining('/food-tracker/recent')
                );
            });
        });

        it('does not load recent foods on mount when autoLoadRecent is false', () => {
            renderHook(() => useFoodSearch({ autoLoadRecent: false }));

            expect(mockApiGet).not.toHaveBeenCalled();
        });
    });

    // -------------------------------------------------------------------------
    // Debounce cancellation (line 195-197, 220-221)
    // -------------------------------------------------------------------------
    describe('Debounce cancellation', () => {
        it('cancels previous debounce when setQuery is called again', async () => {
            mockApiGet.mockResolvedValue({ items: [], total: 0 });

            const { result } = renderHook(() =>
                useFoodSearch({ autoLoadRecent: false, debounceMs: 300 })
            );

            act(() => {
                result.current.setQuery('яблоко');
            });

            // Before debounce fires, change query
            act(() => {
                result.current.setQuery('банан');
            });

            await act(async () => {
                jest.advanceTimersByTime(300);
            });

            // Only one search call should have been made (for 'банан')
            expect(mockApiGet).toHaveBeenCalledTimes(1);
            // URL-encoded Cyrillic: check the raw URL contains the encoded form
            const calledUrl = mockApiGet.mock.calls[0][0] as string;
            expect(calledUrl).toContain(encodeURIComponent('банан'));
        });

        it('searchNow clears pending debounce timer', async () => {
            mockApiGet.mockResolvedValue({ items: [], total: 0 });

            const { result } = renderHook(() =>
                useFoodSearch({ autoLoadRecent: false, debounceMs: 300 })
            );

            // Set query with debounce
            act(() => {
                result.current.setQuery('яблоко');
            });

            // Immediately search for something else
            await act(async () => {
                await result.current.searchNow('банан');
            });

            // Advance timers - the debounced search should NOT fire
            await act(async () => {
                jest.advanceTimersByTime(300);
            });

            // Only the searchNow call should have happened
            expect(mockApiGet).toHaveBeenCalledTimes(1);
        });
    });

    // -------------------------------------------------------------------------
    // searchNow short query branch (line 226)
    // -------------------------------------------------------------------------
    describe('searchNow with short query', () => {
        it('clears results when query is too short', async () => {
            mockApiGet.mockResolvedValueOnce({ items: makeFoodItems(2), total: 2 });

            const { result } = renderHook(() =>
                useFoodSearch({ autoLoadRecent: false, minQueryLength: 3 })
            );

            // First do a valid search
            await act(async () => {
                await result.current.searchNow('яблоко');
            });

            expect(result.current.results).toHaveLength(2);

            // Then search with short query
            await act(async () => {
                await result.current.searchNow('яб');
            });

            expect(result.current.results).toEqual([]);
            expect(result.current.hasMore).toBe(false);
        });
    });

    // -------------------------------------------------------------------------
    // clearSearch branches (lines 241-248)
    // -------------------------------------------------------------------------
    describe('clearSearch abort and timer cleanup', () => {
        it('aborts ongoing request when clearSearch is called', async () => {
            // Make the search hang
            let resolveSearch: (v: any) => void;
            mockApiGet.mockImplementation(() => new Promise((r) => { resolveSearch = r; }));

            const { result } = renderHook(() =>
                useFoodSearch({ autoLoadRecent: false })
            );

            // Start a search
            act(() => {
                result.current.setQuery('яблоко');
            });
            await act(async () => {
                jest.advanceTimersByTime(300);
            });

            // Clear search while request is pending
            act(() => {
                result.current.clearSearch();
            });

            expect(result.current.query).toBe('');
            expect(result.current.results).toEqual([]);
            expect(result.current.error).toBeNull();
        });

        it('clears debounce timer when clearSearch is called', () => {
            mockApiGet.mockResolvedValue({ items: [], total: 0 });

            const { result } = renderHook(() =>
                useFoodSearch({ autoLoadRecent: false, debounceMs: 300 })
            );

            // Set query (starts debounce timer)
            act(() => {
                result.current.setQuery('яблоко');
            });

            // Clear before debounce fires
            act(() => {
                result.current.clearSearch();
            });

            // Advance timers - should not trigger search
            act(() => {
                jest.advanceTimersByTime(300);
            });

            expect(mockApiGet).not.toHaveBeenCalled();
        });
    });

    // -------------------------------------------------------------------------
    // loadFavoriteFoods error (line 280)
    // -------------------------------------------------------------------------
    describe('loadFavoriteFoods error', () => {
        it('sets empty array on error', async () => {
            mockApiGet.mockRejectedValueOnce(new Error('Fail'));

            const { result } = renderHook(() =>
                useFoodSearch({ autoLoadRecent: false })
            );

            await act(async () => {
                await result.current.loadFavoriteFoods();
            });

            expect(result.current.favoriteFoods).toEqual([]);
        });
    });

    // -------------------------------------------------------------------------
    // Pagination page > 0 appending (line 166)
    // -------------------------------------------------------------------------
    describe('Page > 0 appends results', () => {
        it('appends results on subsequent pages instead of replacing', async () => {
            const page1 = makeFoodItems(5);
            mockApiGet.mockResolvedValueOnce({ items: page1, total: 10 });

            const { result } = renderHook(() =>
                useFoodSearch({ autoLoadRecent: false, pageSize: 5 })
            );

            await act(async () => {
                await result.current.searchNow('продукт');
            });

            expect(result.current.results).toHaveLength(5);

            const page2 = makeFoodItems(5);
            mockApiGet.mockResolvedValueOnce({ items: page2, total: 10 });

            await act(async () => {
                await result.current.loadMore();
            });

            // Results should be appended
            expect(result.current.results).toHaveLength(10);
        });
    });
});
