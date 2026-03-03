/**
 * Unit tests for food tracker Zustand store
 * Tests fetchDayData, optimistic updates, rollback, and daily totals recalculation
 * Requirements: 2.4, 2.5
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useFoodTrackerStore } from '../store/foodTrackerStore';
import { apiClient } from '@/shared/utils/api-client';
import toast from 'react-hot-toast';
import type {
    FoodEntry,
    MealType,
    KBZHU,
    GetFoodEntriesResponse,
    WaterLogResponse,
    CreateFoodEntryRequest,
    UpdateFoodEntryRequest,
} from '../types';

// Mock apiClient
jest.mock('@/shared/utils/api-client', () => ({
    apiClient: {
        get: jest.fn(),
        post: jest.fn(),
        put: jest.fn(),
        delete: jest.fn(),
    },
}));

// Mock the config
jest.mock('@/config/api', () => ({
    getApiUrl: (path: string) => `http://localhost:4000/api/v1${path}`,
}));

// Mock react-hot-toast
jest.mock('react-hot-toast', () => ({
    __esModule: true,
    default: {
        success: jest.fn(),
        error: jest.fn(),
    },
}));

const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;
const mockToast = toast as jest.Mocked<typeof toast>;


// ============================================================================
// Test Data Factories
// ============================================================================

const createMockFoodEntry = (overrides: Partial<FoodEntry> = {}): FoodEntry => ({
    id: `entry-${Date.now()}-${Math.random()}`,
    foodId: 'food-123',
    foodName: 'Яблоко',
    mealType: 'breakfast',
    portionType: 'grams',
    portionAmount: 150,
    nutrition: {
        calories: 78,
        protein: 0.4,
        fat: 0.3,
        carbs: 20.7,
    },
    time: '08:30',
    date: '2024-01-15',
    createdAt: '2024-01-15T08:30:00Z',
    updatedAt: '2024-01-15T08:30:00Z',
    ...overrides,
});

const createMockKBZHU = (overrides: Partial<KBZHU> = {}): KBZHU => ({
    calories: 0,
    protein: 0,
    fat: 0,
    carbs: 0,
    ...overrides,
});

const createMockEntriesResponse = (
    entries: FoodEntry[] = [],
    dailyTotals: KBZHU = createMockKBZHU()
): GetFoodEntriesResponse => ({
    entries,
    dailyTotals,
});

const createMockWaterResponse = (
    glasses: number = 0,
    goal: number = 8,
    glassSize: number = 250
): WaterLogResponse => ({
    glasses,
    goal,
    glass_size: glassSize,
    enabled: true,
});

// ============================================================================
// Test Setup
// ============================================================================

describe('foodTrackerStore', () => {
    beforeEach(() => {
        // Clear localStorage
        localStorage.clear();

        // Reset store state before each test using setState
        useFoodTrackerStore.setState({
            selectedDate: new Date().toISOString().split('T')[0],
            entries: {
                breakfast: [],
                lunch: [],
                dinner: [],
                snack: [],
            },
            isLoading: false,
            error: null,
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
                isCustom: false,
            },
            waterIntake: 0,
            waterGoal: 8,
            glassSize: 250,
            isOffline: false,
            pendingOperations: [],
        });

        jest.clearAllMocks();

        // Mock navigator.onLine
        Object.defineProperty(navigator, 'onLine', {
            value: true,
            writable: true,
            configurable: true,
        });
    });

    afterEach(() => {
        localStorage.clear();
    });


    // ============================================================================
    // fetchDayData Tests
    // ============================================================================

    describe('fetchDayData', () => {
        it('should fetch entries and water data successfully', async () => {
            const mockEntries: FoodEntry[] = [
                createMockFoodEntry({ id: '1', mealType: 'breakfast' }),
                createMockFoodEntry({ id: '2', mealType: 'lunch' }),
            ];

            mockApiClient.get.mockImplementation((url: string) => {
                if (url.includes('/entries')) {
                    return Promise.resolve(createMockEntriesResponse(mockEntries));
                }
                if (url.includes('/water')) {
                    return Promise.resolve(createMockWaterResponse(3, 8, 250));
                }
                return Promise.reject(new Error('Unknown endpoint'));
            });

            const { result } = renderHook(() => useFoodTrackerStore());

            await act(async () => {
                await result.current.fetchDayData('2024-01-15');
            });

            expect(mockApiClient.get).toHaveBeenCalledWith(
                expect.stringContaining('/food-tracker/entries?date=2024-01-15')
            );
            expect(mockApiClient.get).toHaveBeenCalledWith(
                expect.stringContaining('/food-tracker/water?date=2024-01-15')
            );
            expect(result.current.entries.breakfast).toHaveLength(1);
            expect(result.current.entries.lunch).toHaveLength(1);
            expect(result.current.waterIntake).toBe(3);
            expect(result.current.isLoading).toBe(false);
            expect(result.current.error).toBeNull();
        });

        it('should set loading state during fetch', async () => {
            let resolveEntries: (value: any) => void;
            const entriesPromise = new Promise((resolve) => {
                resolveEntries = resolve;
            });

            mockApiClient.get.mockImplementation((url: string) => {
                if (url.includes('/entries')) {
                    return entriesPromise;
                }
                if (url.includes('/water')) {
                    return Promise.resolve(createMockWaterResponse());
                }
                return Promise.reject(new Error('Unknown endpoint'));
            });

            const { result } = renderHook(() => useFoodTrackerStore());

            // Start fetch without awaiting
            act(() => {
                result.current.fetchDayData('2024-01-15');
            });

            // Check loading state is true
            await waitFor(() => {
                expect(result.current.isLoading).toBe(true);
            });

            // Resolve the promise
            await act(async () => {
                resolveEntries!(createMockEntriesResponse([]));
            });

            // Check loading state is false after completion
            await waitFor(() => {
                expect(result.current.isLoading).toBe(false);
            });
        });

        it('should handle network errors with Russian message', async () => {
            const networkError = new TypeError('Failed to fetch');
            mockApiClient.get.mockRejectedValue(networkError);

            const { result } = renderHook(() => useFoodTrackerStore());

            await act(async () => {
                await result.current.fetchDayData('2024-01-15');
            });

            expect(result.current.error).toEqual({
                code: 'NETWORK_ERROR',
                message: 'Проверьте подключение к интернету',
            });
            expect(result.current.isLoading).toBe(false);
            expect(mockToast.error).toHaveBeenCalledWith('Проверьте подключение к интернету');
        });

        it('should handle 401 unauthorized errors', async () => {
            const authError = {
                response: { status: 401, data: { message: 'Unauthorized' } },
            };
            mockApiClient.get.mockRejectedValue(authError);

            const { result } = renderHook(() => useFoodTrackerStore());

            await act(async () => {
                await result.current.fetchDayData('2024-01-15');
            });

            expect(result.current.error).toEqual({
                code: 'UNAUTHORIZED',
                message: 'Требуется авторизация',
            });
        });

        it('should handle 500 server errors', async () => {
            const serverError = {
                response: { status: 500, data: { message: 'Internal server error' } },
            };
            mockApiClient.get.mockRejectedValue(serverError);

            const { result } = renderHook(() => useFoodTrackerStore());

            await act(async () => {
                await result.current.fetchDayData('2024-01-15');
            });

            expect(result.current.error).toEqual({
                code: 'SERVER_ERROR',
                message: 'Сервис временно недоступен',
            });
        });

        it('should not fetch if already loading', async () => {
            let resolveEntries: (value: any) => void;
            const entriesPromise = new Promise((resolve) => {
                resolveEntries = resolve;
            });

            mockApiClient.get.mockImplementation((url: string) => {
                if (url.includes('/entries')) {
                    return entriesPromise;
                }
                if (url.includes('/water')) {
                    return Promise.resolve(createMockWaterResponse());
                }
                return Promise.reject(new Error('Unknown endpoint'));
            });

            const { result } = renderHook(() => useFoodTrackerStore());

            // Start first fetch
            act(() => {
                result.current.fetchDayData('2024-01-15');
            });

            // Wait for loading state
            await waitFor(() => {
                expect(result.current.isLoading).toBe(true);
            });

            // Try second fetch while first is loading
            act(() => {
                result.current.fetchDayData('2024-01-15');
            });

            // Resolve the promise
            await act(async () => {
                resolveEntries!(createMockEntriesResponse([]));
            });

            // Should only have called API once for entries
            const entriesCalls = mockApiClient.get.mock.calls.filter(
                call => call[0].includes('/entries')
            );
            expect(entriesCalls.length).toBe(1);
        });

        it('should update selectedDate when fetching', async () => {
            mockApiClient.get.mockImplementation((url: string) => {
                if (url.includes('/entries')) {
                    return Promise.resolve(createMockEntriesResponse([]));
                }
                if (url.includes('/water')) {
                    return Promise.resolve(createMockWaterResponse());
                }
                return Promise.reject(new Error('Unknown endpoint'));
            });

            const { result } = renderHook(() => useFoodTrackerStore());

            await act(async () => {
                await result.current.fetchDayData('2024-02-20');
            });

            expect(result.current.selectedDate).toBe('2024-02-20');
        });

        it('should group entries by meal type correctly', async () => {
            const mockEntries: FoodEntry[] = [
                createMockFoodEntry({ id: '1', mealType: 'breakfast' }),
                createMockFoodEntry({ id: '2', mealType: 'breakfast' }),
                createMockFoodEntry({ id: '3', mealType: 'lunch' }),
                createMockFoodEntry({ id: '4', mealType: 'dinner' }),
                createMockFoodEntry({ id: '5', mealType: 'snack' }),
            ];

            mockApiClient.get.mockImplementation((url: string) => {
                if (url.includes('/entries')) {
                    return Promise.resolve(createMockEntriesResponse(mockEntries));
                }
                if (url.includes('/water')) {
                    return Promise.resolve(createMockWaterResponse());
                }
                return Promise.reject(new Error('Unknown endpoint'));
            });

            const { result } = renderHook(() => useFoodTrackerStore());

            await act(async () => {
                await result.current.fetchDayData('2024-01-15');
            });

            expect(result.current.entries.breakfast).toHaveLength(2);
            expect(result.current.entries.lunch).toHaveLength(1);
            expect(result.current.entries.dinner).toHaveLength(1);
            expect(result.current.entries.snack).toHaveLength(1);
        });
    });


    // ============================================================================
    // Daily Totals Recalculation Tests (Requirements 2.4, 2.5)
    // ============================================================================

    describe('daily totals recalculation', () => {
        it('should calculate daily totals from all entries', async () => {
            const mockEntries: FoodEntry[] = [
                createMockFoodEntry({
                    id: '1',
                    mealType: 'breakfast',
                    nutrition: { calories: 100, protein: 10, fat: 5, carbs: 15 },
                }),
                createMockFoodEntry({
                    id: '2',
                    mealType: 'lunch',
                    nutrition: { calories: 200, protein: 20, fat: 10, carbs: 25 },
                }),
                createMockFoodEntry({
                    id: '3',
                    mealType: 'dinner',
                    nutrition: { calories: 300, protein: 30, fat: 15, carbs: 35 },
                }),
            ];

            mockApiClient.get.mockImplementation((url: string) => {
                if (url.includes('/entries')) {
                    return Promise.resolve(createMockEntriesResponse(mockEntries));
                }
                if (url.includes('/water')) {
                    return Promise.resolve(createMockWaterResponse());
                }
                return Promise.reject(new Error('Unknown endpoint'));
            });

            const { result } = renderHook(() => useFoodTrackerStore());

            await act(async () => {
                await result.current.fetchDayData('2024-01-15');
            });

            // Verify totals are sum of all entries
            expect(result.current.dailyTotals.calories).toBe(600);
            expect(result.current.dailyTotals.protein).toBe(60);
            expect(result.current.dailyTotals.fat).toBe(30);
            expect(result.current.dailyTotals.carbs).toBe(75);
        });

        it('should recalculate totals when entry is added', async () => {
            const initialEntry = createMockFoodEntry({
                id: '1',
                mealType: 'breakfast',
                nutrition: { calories: 100, protein: 10, fat: 5, carbs: 15 },
            });

            mockApiClient.get.mockImplementation((url: string) => {
                if (url.includes('/entries')) {
                    return Promise.resolve(createMockEntriesResponse([initialEntry]));
                }
                if (url.includes('/water')) {
                    return Promise.resolve(createMockWaterResponse());
                }
                return Promise.reject(new Error('Unknown endpoint'));
            });

            const { result } = renderHook(() => useFoodTrackerStore());

            await act(async () => {
                await result.current.fetchDayData('2024-01-15');
            });

            // Initial totals
            expect(result.current.dailyTotals.calories).toBe(100);

            // Add new entry
            const newEntry = createMockFoodEntry({
                id: '2',
                mealType: 'lunch',
                nutrition: { calories: 200, protein: 20, fat: 10, carbs: 25 },
            });

            mockApiClient.post.mockResolvedValueOnce(newEntry);

            await act(async () => {
                await result.current.addEntry('lunch', {
                    foodId: 'food-456',
                    mealType: 'lunch',
                    portionType: 'grams',
                    portionAmount: 200,
                    time: '12:30',
                    date: '2024-01-15',
                });
            });

            // Totals should be updated
            expect(result.current.dailyTotals.calories).toBe(300);
            expect(result.current.dailyTotals.protein).toBe(30);
            expect(result.current.dailyTotals.fat).toBe(15);
            expect(result.current.dailyTotals.carbs).toBe(40);
        });

        it('should recalculate totals when entry is deleted', async () => {
            const entries: FoodEntry[] = [
                createMockFoodEntry({
                    id: '1',
                    mealType: 'breakfast',
                    nutrition: { calories: 100, protein: 10, fat: 5, carbs: 15 },
                }),
                createMockFoodEntry({
                    id: '2',
                    mealType: 'lunch',
                    nutrition: { calories: 200, protein: 20, fat: 10, carbs: 25 },
                }),
            ];

            mockApiClient.get.mockImplementation((url: string) => {
                if (url.includes('/entries')) {
                    return Promise.resolve(createMockEntriesResponse(entries));
                }
                if (url.includes('/water')) {
                    return Promise.resolve(createMockWaterResponse());
                }
                return Promise.reject(new Error('Unknown endpoint'));
            });

            const { result } = renderHook(() => useFoodTrackerStore());

            await act(async () => {
                await result.current.fetchDayData('2024-01-15');
            });

            // Initial totals
            expect(result.current.dailyTotals.calories).toBe(300);

            // Delete entry
            mockApiClient.delete.mockResolvedValueOnce({});

            await act(async () => {
                await result.current.deleteEntry('2', 'lunch');
            });

            // Totals should be updated
            expect(result.current.dailyTotals.calories).toBe(100);
            expect(result.current.dailyTotals.protein).toBe(10);
            expect(result.current.dailyTotals.fat).toBe(5);
            expect(result.current.dailyTotals.carbs).toBe(15);
        });

        it('should recalculate totals when entry is updated', async () => {
            const entry = createMockFoodEntry({
                id: '1',
                mealType: 'breakfast',
                nutrition: { calories: 100, protein: 10, fat: 5, carbs: 15 },
            });

            mockApiClient.get.mockImplementation((url: string) => {
                if (url.includes('/entries')) {
                    return Promise.resolve(createMockEntriesResponse([entry]));
                }
                if (url.includes('/water')) {
                    return Promise.resolve(createMockWaterResponse());
                }
                return Promise.reject(new Error('Unknown endpoint'));
            });

            const { result } = renderHook(() => useFoodTrackerStore());

            await act(async () => {
                await result.current.fetchDayData('2024-01-15');
            });

            // Initial totals
            expect(result.current.dailyTotals.calories).toBe(100);

            // Update entry with new nutrition values
            const updatedEntry: FoodEntry = {
                ...entry,
                portionAmount: 300,
                nutrition: { calories: 200, protein: 20, fat: 10, carbs: 30 },
                updatedAt: new Date().toISOString(),
            };

            mockApiClient.put.mockResolvedValueOnce(updatedEntry);

            await act(async () => {
                await result.current.updateEntry('1', {
                    portionAmount: 300,
                });
            });

            // Totals should be updated
            expect(result.current.dailyTotals.calories).toBe(200);
            expect(result.current.dailyTotals.protein).toBe(20);
            expect(result.current.dailyTotals.fat).toBe(10);
            expect(result.current.dailyTotals.carbs).toBe(30);
        });

        it('should round totals to 1 decimal place', async () => {
            const mockEntries: FoodEntry[] = [
                createMockFoodEntry({
                    id: '1',
                    mealType: 'breakfast',
                    nutrition: { calories: 100.123, protein: 10.456, fat: 5.789, carbs: 15.111 },
                }),
                createMockFoodEntry({
                    id: '2',
                    mealType: 'lunch',
                    nutrition: { calories: 200.456, protein: 20.789, fat: 10.111, carbs: 25.222 },
                }),
            ];

            mockApiClient.get.mockImplementation((url: string) => {
                if (url.includes('/entries')) {
                    return Promise.resolve(createMockEntriesResponse(mockEntries));
                }
                if (url.includes('/water')) {
                    return Promise.resolve(createMockWaterResponse());
                }
                return Promise.reject(new Error('Unknown endpoint'));
            });

            const { result } = renderHook(() => useFoodTrackerStore());

            await act(async () => {
                await result.current.fetchDayData('2024-01-15');
            });

            // Verify totals are rounded to 1 decimal place
            expect(result.current.dailyTotals.calories).toBe(300.6);
            expect(result.current.dailyTotals.protein).toBe(31.2);
            expect(result.current.dailyTotals.fat).toBe(15.9);
            expect(result.current.dailyTotals.carbs).toBe(40.3);
        });

        it('should return zero totals for empty entries', async () => {
            mockApiClient.get.mockImplementation((url: string) => {
                if (url.includes('/entries')) {
                    return Promise.resolve(createMockEntriesResponse([]));
                }
                if (url.includes('/water')) {
                    return Promise.resolve(createMockWaterResponse());
                }
                return Promise.reject(new Error('Unknown endpoint'));
            });

            const { result } = renderHook(() => useFoodTrackerStore());

            await act(async () => {
                await result.current.fetchDayData('2024-01-15');
            });

            expect(result.current.dailyTotals.calories).toBe(0);
            expect(result.current.dailyTotals.protein).toBe(0);
            expect(result.current.dailyTotals.fat).toBe(0);
            expect(result.current.dailyTotals.carbs).toBe(0);
        });
    });


    // ============================================================================
    // Optimistic Update Tests
    // ============================================================================

    describe('optimistic updates', () => {
        describe('addEntry optimistic update', () => {
            it('should add entry optimistically before API response', async () => {
                let resolvePost: (value: any) => void;
                const postPromise = new Promise((resolve) => {
                    resolvePost = resolve;
                });

                mockApiClient.post.mockReturnValue(postPromise);

                const { result } = renderHook(() => useFoodTrackerStore());

                const request: CreateFoodEntryRequest = {
                    foodId: 'food-123',
                    mealType: 'breakfast',
                    portionType: 'grams',
                    portionAmount: 150,
                    time: '08:30',
                    date: '2024-01-15',
                };

                // Start add without awaiting
                act(() => {
                    result.current.addEntry('breakfast', request);
                });

                // Entry should be added optimistically (with temp ID)
                await waitFor(() => {
                    expect(result.current.entries.breakfast).toHaveLength(1);
                    expect(result.current.entries.breakfast[0].id).toContain('temp_');
                });

                // Resolve with real entry
                const realEntry = createMockFoodEntry({
                    id: 'real-entry-id',
                    ...request,
                });

                await act(async () => {
                    resolvePost!(realEntry);
                });

                // Entry should be replaced with real entry
                await waitFor(() => {
                    expect(result.current.entries.breakfast).toHaveLength(1);
                    expect(result.current.entries.breakfast[0].id).toBe('real-entry-id');
                });
            });

            it('should show success toast on successful add', async () => {
                const newEntry = createMockFoodEntry({ id: 'new-entry' });
                mockApiClient.post.mockResolvedValueOnce(newEntry);

                const { result } = renderHook(() => useFoodTrackerStore());

                await act(async () => {
                    await result.current.addEntry('breakfast', {
                        foodId: 'food-123',
                        mealType: 'breakfast',
                        portionType: 'grams',
                        portionAmount: 150,
                        time: '08:30',
                        date: '2024-01-15',
                    });
                });

                expect(mockToast.success).toHaveBeenCalledWith('Запись добавлена');
            });
        });

        describe('updateEntry optimistic update', () => {
            it('should update entry optimistically before API response', async () => {
                const originalEntry = createMockFoodEntry({
                    id: '1',
                    mealType: 'breakfast',
                    portionAmount: 100,
                });

                // Set initial state
                const { result } = renderHook(() => useFoodTrackerStore());
                act(() => {
                    result.current.entries.breakfast = [originalEntry];
                });

                let resolveUpdate: (value: any) => void;
                const updatePromise = new Promise((resolve) => {
                    resolveUpdate = resolve;
                });

                mockApiClient.put.mockReturnValue(updatePromise);

                // Start update without awaiting
                act(() => {
                    result.current.updateEntry('1', { portionAmount: 200 });
                });

                // Entry should be updated optimistically
                await waitFor(() => {
                    expect(result.current.entries.breakfast[0].portionAmount).toBe(200);
                });

                // Resolve with updated entry
                const updatedEntry: FoodEntry = {
                    ...originalEntry,
                    portionAmount: 200,
                    updatedAt: new Date().toISOString(),
                };

                await act(async () => {
                    resolveUpdate!(updatedEntry);
                });

                expect(mockToast.success).toHaveBeenCalledWith('Запись обновлена');
            });

            it('should handle entry not found', async () => {
                const { result } = renderHook(() => useFoodTrackerStore());

                await act(async () => {
                    const response = await result.current.updateEntry('non-existent', {
                        portionAmount: 200,
                    });
                    expect(response).toBeNull();
                });

                expect(mockToast.error).toHaveBeenCalledWith('Запись не найдена');
            });
        });

        describe('deleteEntry optimistic update', () => {
            it('should delete entry optimistically before API response', async () => {
                const entry = createMockFoodEntry({ id: '1', mealType: 'breakfast' });

                const { result } = renderHook(() => useFoodTrackerStore());
                act(() => {
                    result.current.entries.breakfast = [entry];
                });

                let resolveDelete: (value: any) => void;
                const deletePromise = new Promise((resolve) => {
                    resolveDelete = resolve;
                });

                mockApiClient.delete.mockReturnValue(deletePromise);

                // Start delete without awaiting
                act(() => {
                    result.current.deleteEntry('1', 'breakfast');
                });

                // Entry should be deleted optimistically
                await waitFor(() => {
                    expect(result.current.entries.breakfast).toHaveLength(0);
                });

                // Resolve delete
                await act(async () => {
                    resolveDelete!({});
                });

                expect(mockToast.success).toHaveBeenCalledWith('Запись удалена');
            });

            it('should handle entry not found on delete', async () => {
                const { result } = renderHook(() => useFoodTrackerStore());

                await act(async () => {
                    const success = await result.current.deleteEntry('non-existent', 'breakfast');
                    expect(success).toBe(false);
                });

                expect(mockToast.error).toHaveBeenCalledWith('Запись не найдена');
            });
        });
    });


    // ============================================================================
    // Rollback Tests
    // ============================================================================

    describe('rollback on failure', () => {
        describe('addEntry rollback', () => {
            it('should rollback optimistic add on API failure', async () => {
                // Use 400 error to avoid retry logic (4xx errors are not retried)
                const apiError = {
                    response: { status: 400, data: { message: 'Неверный формат данных' } },
                };
                mockApiClient.post.mockRejectedValueOnce(apiError);

                const { result } = renderHook(() => useFoodTrackerStore());

                await act(async () => {
                    const response = await result.current.addEntry('breakfast', {
                        foodId: 'food-123',
                        mealType: 'breakfast',
                        portionType: 'grams',
                        portionAmount: 150,
                        time: '08:30',
                        date: '2024-01-15',
                    });
                    expect(response).toBeNull();
                });

                // Entry should be rolled back (removed)
                expect(result.current.entries.breakfast).toHaveLength(0);
                expect(result.current.error).toEqual({
                    code: 'VALIDATION_ERROR',
                    message: 'Неверный формат данных',
                });
                expect(mockToast.error).toHaveBeenCalled();
            });

            it('should rollback daily totals on add failure', async () => {
                const existingEntry = createMockFoodEntry({
                    id: '1',
                    mealType: 'breakfast',
                    nutrition: { calories: 100, protein: 10, fat: 5, carbs: 15 },
                });

                mockApiClient.get.mockImplementation((url: string) => {
                    if (url.includes('/entries')) {
                        return Promise.resolve(createMockEntriesResponse([existingEntry]));
                    }
                    if (url.includes('/water')) {
                        return Promise.resolve(createMockWaterResponse());
                    }
                    return Promise.reject(new Error('Unknown endpoint'));
                });

                const { result } = renderHook(() => useFoodTrackerStore());

                await act(async () => {
                    await result.current.fetchDayData('2024-01-15');
                });

                // Initial totals
                expect(result.current.dailyTotals.calories).toBe(100);

                // Fail the add with 400 error (not retried)
                const apiError = {
                    response: { status: 400, data: { message: 'Неверный формат данных' } },
                };
                mockApiClient.post.mockRejectedValueOnce(apiError);

                await act(async () => {
                    await result.current.addEntry('lunch', {
                        foodId: 'food-456',
                        mealType: 'lunch',
                        portionType: 'grams',
                        portionAmount: 200,
                        time: '12:30',
                        date: '2024-01-15',
                    });
                });

                // Totals should be rolled back
                expect(result.current.dailyTotals.calories).toBe(100);
            });
        });

        describe('updateEntry rollback', () => {
            it('should rollback optimistic update on API failure', async () => {
                const originalEntry = createMockFoodEntry({
                    id: '1',
                    mealType: 'breakfast',
                    portionAmount: 100,
                    nutrition: { calories: 100, protein: 10, fat: 5, carbs: 15 },
                });

                // Set initial state using setState
                useFoodTrackerStore.setState({
                    entries: {
                        breakfast: [originalEntry],
                        lunch: [],
                        dinner: [],
                        snack: [],
                    },
                });

                const { result } = renderHook(() => useFoodTrackerStore());

                // Use 400 error to avoid retry logic
                const apiError = {
                    response: { status: 400, data: { message: 'Неверный формат данных' } },
                };
                mockApiClient.put.mockRejectedValueOnce(apiError);

                await act(async () => {
                    const response = await result.current.updateEntry('1', {
                        portionAmount: 200,
                    });
                    expect(response).toBeNull();
                });

                // Entry should be rolled back to original values
                expect(result.current.entries.breakfast[0].portionAmount).toBe(100);
                expect(result.current.error).toEqual({
                    code: 'VALIDATION_ERROR',
                    message: 'Неверный формат данных',
                });
                expect(mockToast.error).toHaveBeenCalled();
            });

            it('should rollback meal type change on update failure', async () => {
                const originalEntry = createMockFoodEntry({
                    id: '1',
                    mealType: 'breakfast',
                });

                // Set initial state using setState
                useFoodTrackerStore.setState({
                    entries: {
                        breakfast: [originalEntry],
                        lunch: [],
                        dinner: [],
                        snack: [],
                    },
                });

                const { result } = renderHook(() => useFoodTrackerStore());

                // Use 400 error to avoid retry logic
                const apiError = {
                    response: { status: 400, data: { message: 'Неверный формат данных' } },
                };
                mockApiClient.put.mockRejectedValueOnce(apiError);

                await act(async () => {
                    await result.current.updateEntry('1', {
                        mealType: 'lunch',
                    });
                });

                // Entry should be back in breakfast, not in lunch
                expect(result.current.entries.breakfast).toHaveLength(1);
                expect(result.current.entries.lunch).toHaveLength(0);
            });
        });

        describe('deleteEntry rollback', () => {
            it('should rollback optimistic delete on API failure', async () => {
                const entry = createMockFoodEntry({
                    id: '1',
                    mealType: 'breakfast',
                    nutrition: { calories: 100, protein: 10, fat: 5, carbs: 15 },
                });

                // Set initial state using setState
                useFoodTrackerStore.setState({
                    entries: {
                        breakfast: [entry],
                        lunch: [],
                        dinner: [],
                        snack: [],
                    },
                });

                const { result } = renderHook(() => useFoodTrackerStore());

                // Use 400 error to avoid retry logic
                const apiError = {
                    response: { status: 400, data: { message: 'Неверный формат данных' } },
                };
                mockApiClient.delete.mockRejectedValueOnce(apiError);

                await act(async () => {
                    const success = await result.current.deleteEntry('1', 'breakfast');
                    expect(success).toBe(false);
                });

                // Entry should be restored
                expect(result.current.entries.breakfast).toHaveLength(1);
                expect(result.current.entries.breakfast[0].id).toBe('1');
                expect(result.current.error).toEqual({
                    code: 'VALIDATION_ERROR',
                    message: 'Неверный формат данных',
                });
            });

            it('should rollback daily totals on delete failure', async () => {
                const entry = createMockFoodEntry({
                    id: '1',
                    mealType: 'breakfast',
                    nutrition: { calories: 100, protein: 10, fat: 5, carbs: 15 },
                });

                mockApiClient.get.mockImplementation((url: string) => {
                    if (url.includes('/entries')) {
                        return Promise.resolve(createMockEntriesResponse([entry]));
                    }
                    if (url.includes('/water')) {
                        return Promise.resolve(createMockWaterResponse());
                    }
                    return Promise.reject(new Error('Unknown endpoint'));
                });

                const { result } = renderHook(() => useFoodTrackerStore());

                await act(async () => {
                    await result.current.fetchDayData('2024-01-15');
                });

                // Initial totals
                expect(result.current.dailyTotals.calories).toBe(100);

                // Fail the delete with 400 error (not retried)
                const apiError = {
                    response: { status: 400, data: { message: 'Неверный формат данных' } },
                };
                mockApiClient.delete.mockRejectedValueOnce(apiError);

                await act(async () => {
                    await result.current.deleteEntry('1', 'breakfast');
                });

                // Totals should be rolled back
                expect(result.current.dailyTotals.calories).toBe(100);
            });
        });
    });


    // ============================================================================
    // Water Tracking Tests
    // ============================================================================

    describe('water tracking', () => {
        it('should add water with optimistic update', async () => {
            const { result } = renderHook(() => useFoodTrackerStore());

            mockApiClient.post.mockResolvedValueOnce({
                glasses: 1,
                goal: 8,
                glass_size: 250,
            });

            await act(async () => {
                await result.current.addWater(1);
            });

            expect(result.current.waterIntake).toBe(1);
        });

        it('should rollback water on API failure', async () => {
            const { result } = renderHook(() => useFoodTrackerStore());

            // Set initial water intake
            act(() => {
                useFoodTrackerStore.setState({ waterIntake: 3 });
            });

            const apiError = {
                response: { status: 400, data: { message: 'Bad request' } },
            };
            mockApiClient.post.mockRejectedValueOnce(apiError);

            await act(async () => {
                await result.current.addWater(1);
            });

            // Should rollback to original value
            expect(result.current.waterIntake).toBe(3);
            expect(mockToast.error).toHaveBeenCalled();
        });

        it('should set water goal', () => {
            const { result } = renderHook(() => useFoodTrackerStore());

            act(() => {
                result.current.setWaterGoal(10);
            });

            expect(result.current.waterGoal).toBe(10);
        });

        it('should set glass size', () => {
            const { result } = renderHook(() => useFoodTrackerStore());

            act(() => {
                result.current.setGlassSize(300);
            });

            expect(result.current.glassSize).toBe(300);
        });
    });

    // ============================================================================
    // Target Goals Tests
    // ============================================================================

    describe('target goals', () => {
        it('should set target goals', () => {
            const { result } = renderHook(() => useFoodTrackerStore());

            act(() => {
                result.current.setTargetGoals({
                    calories: 2500,
                    protein: 180,
                });
            });

            expect(result.current.targetGoals.calories).toBe(2500);
            expect(result.current.targetGoals.protein).toBe(180);
            expect(result.current.targetGoals.isCustom).toBe(true);
        });

        it('should preserve existing goals when setting partial update', () => {
            const { result } = renderHook(() => useFoodTrackerStore());

            // Set initial goals
            act(() => {
                result.current.setTargetGoals({
                    calories: 2500,
                    protein: 180,
                    fat: 80,
                    carbs: 300,
                });
            });

            // Update only calories
            act(() => {
                result.current.setTargetGoals({
                    calories: 3000,
                });
            });

            expect(result.current.targetGoals.calories).toBe(3000);
            expect(result.current.targetGoals.protein).toBe(180);
            expect(result.current.targetGoals.fat).toBe(80);
            expect(result.current.targetGoals.carbs).toBe(300);
        });
    });

    // ============================================================================
    // Error Handling Tests
    // ============================================================================

    describe('error handling', () => {
        it('should clear error state', () => {
            const { result } = renderHook(() => useFoodTrackerStore());

            act(() => {
                useFoodTrackerStore.setState({
                    error: { code: 'NETWORK_ERROR', message: 'Test error' },
                });
            });

            expect(result.current.error).not.toBeNull();

            act(() => {
                result.current.clearError();
            });

            expect(result.current.error).toBeNull();
        });

        it('should map 404 errors correctly', async () => {
            const notFoundError = {
                response: { status: 404, data: { message: 'Not found' } },
            };
            mockApiClient.get.mockRejectedValue(notFoundError);

            const { result } = renderHook(() => useFoodTrackerStore());

            await act(async () => {
                await result.current.fetchDayData('2024-01-15');
            });

            expect(result.current.error).toEqual({
                code: 'NOT_FOUND',
                message: 'Запись не найдена',
            });
        });

        it('should map 400 validation errors correctly', async () => {
            const validationError = {
                response: { status: 400, data: { message: 'Неверный формат даты' } },
            };
            mockApiClient.get.mockRejectedValue(validationError);

            const { result } = renderHook(() => useFoodTrackerStore());

            await act(async () => {
                await result.current.fetchDayData('invalid-date');
            });

            expect(result.current.error).toEqual({
                code: 'VALIDATION_ERROR',
                message: 'Неверный формат даты',
            });
        });
    });

    // ============================================================================
    // Reset Tests
    // ============================================================================

    describe('reset', () => {
        it('should reset store to initial state', () => {
            // Set some state using setState
            useFoodTrackerStore.setState({
                entries: {
                    breakfast: [createMockFoodEntry({ id: '1', nutrition: { calories: 100, protein: 10, fat: 5, carbs: 15 } })],
                    lunch: [],
                    dinner: [],
                    snack: [],
                },
                dailyTotals: { calories: 100, protein: 10, fat: 5, carbs: 15 },
                waterIntake: 5,
                error: { code: 'NETWORK_ERROR', message: 'Test error' },
            });

            const { result } = renderHook(() => useFoodTrackerStore());

            // Verify state was set
            expect(result.current.entries.breakfast).toHaveLength(1);
            expect(result.current.waterIntake).toBe(5);

            act(() => {
                result.current.reset();
            });

            expect(result.current.entries.breakfast).toEqual([]);
            expect(result.current.entries.lunch).toEqual([]);
            expect(result.current.entries.dinner).toEqual([]);
            expect(result.current.entries.snack).toEqual([]);
            expect(result.current.dailyTotals.calories).toBe(0);
            expect(result.current.waterIntake).toBe(0);
            expect(result.current.error).toBeNull();
            expect(result.current.isLoading).toBe(false);
        });
    });

    // ============================================================================
    // Offline Support Tests
    // ============================================================================

    describe('offline support', () => {
        it('should set offline status', () => {
            const { result } = renderHook(() => useFoodTrackerStore());

            act(() => {
                result.current.setOfflineStatus(true);
            });

            expect(result.current.isOffline).toBe(true);
            expect(mockToast.error).toHaveBeenCalledWith(
                'Нет подключения к интернету',
                expect.any(Object)
            );
        });

        it('should show success toast when coming back online', () => {
            const { result } = renderHook(() => useFoodTrackerStore());

            // Go offline first
            act(() => {
                result.current.setOfflineStatus(true);
            });

            jest.clearAllMocks();

            // Come back online
            act(() => {
                result.current.setOfflineStatus(false);
            });

            expect(mockToast.success).toHaveBeenCalledWith(
                'Подключение восстановлено',
                expect.any(Object)
            );
        });

        it('should load from cache when offline', async () => {
            // Set up cached data
            const cachedEntries = {
                breakfast: [createMockFoodEntry({ id: 'cached-1' })],
                lunch: [],
                dinner: [],
                snack: [],
            };
            localStorage.setItem(
                'food_tracker_entries_2024-01-15',
                JSON.stringify(cachedEntries)
            );

            const { result } = renderHook(() => useFoodTrackerStore());

            // Set offline
            act(() => {
                result.current.setOfflineStatus(true);
            });

            // Fetch should load from cache
            await act(async () => {
                await result.current.fetchDayData('2024-01-15');
            });

            expect(result.current.entries.breakfast).toHaveLength(1);
            expect(result.current.entries.breakfast[0].id).toBe('cached-1');
            // API should not be called
            expect(mockApiClient.get).not.toHaveBeenCalled();
        });

        it('should queue operations when offline', async () => {
            // Set offline
            Object.defineProperty(navigator, 'onLine', {
                value: false,
                writable: true,
                configurable: true,
            });

            useFoodTrackerStore.setState({
                isOffline: true,
            });

            const { result } = renderHook(() => useFoodTrackerStore());

            // Add entry while offline
            await act(async () => {
                await result.current.addEntry('breakfast', {
                    foodId: 'food-123',
                    mealType: 'breakfast',
                    portionType: 'grams',
                    portionAmount: 150,
                    time: '08:30',
                    date: '2024-01-15',
                });
            });

            // Entry should be added locally
            expect(result.current.entries.breakfast).toHaveLength(1);
            // Operation should be queued
            expect(result.current.pendingOperations).toHaveLength(1);
            expect(result.current.pendingOperations[0].type).toBe('add');
            // API should not be called
            expect(mockApiClient.post).not.toHaveBeenCalled();
        });
    });
});
