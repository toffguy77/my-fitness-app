/**
 * Unit tests for useFoodTracker hook
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useFoodTracker } from '../useFoodTracker';
import { useFoodTrackerStore } from '../../store/foodTrackerStore';
import type { MealType, CreateFoodEntryRequest, FoodEntry, KBZHU } from '../../types';

// Mock the store
jest.mock('../../store/foodTrackerStore');

// Mock toast
jest.mock('react-hot-toast', () => ({
    success: jest.fn(),
    error: jest.fn(),
}));

describe('useFoodTracker', () => {
    const mockEntries = {
        breakfast: [
            {
                id: '1',
                foodId: 'food-1',
                foodName: 'Овсянка',
                mealType: 'breakfast' as MealType,
                portionType: 'grams' as const,
                portionAmount: 100,
                nutrition: { calories: 350, protein: 12, fat: 6, carbs: 60 },
                time: '08:00',
                date: '2024-01-15',
                createdAt: '2024-01-15T08:00:00Z',
                updatedAt: '2024-01-15T08:00:00Z',
            },
        ],
        lunch: [],
        dinner: [],
        snack: [],
    };

    const mockDailyTotals: KBZHU = {
        calories: 350,
        protein: 12,
        fat: 6,
        carbs: 60,
    };

    const mockTargetGoals = {
        calories: 2000,
        protein: 150,
        fat: 67,
        carbs: 200,
        isCustom: false,
    };

    const mockFetchDayData = jest.fn();
    const mockAddEntry = jest.fn();
    const mockUpdateEntry = jest.fn();
    const mockDeleteEntry = jest.fn();
    const mockSetSelectedDate = jest.fn();
    const mockSetTargetGoals = jest.fn();
    const mockClearError = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();

        (useFoodTrackerStore as unknown as jest.Mock).mockImplementation((selector) => {
            const state = {
                entries: mockEntries,
                dailyTotals: mockDailyTotals,
                targetGoals: mockTargetGoals,
                selectedDate: '2024-01-15',
                isLoading: false,
                error: null,
                isOffline: false,
                fetchDayData: mockFetchDayData,
                addEntry: mockAddEntry,
                updateEntry: mockUpdateEntry,
                deleteEntry: mockDeleteEntry,
                setSelectedDate: mockSetSelectedDate,
                setTargetGoals: mockSetTargetGoals,
                clearError: mockClearError,
            };
            return selector(state);
        });
    });

    describe('initialization', () => {
        it('returns entries from store', () => {
            const { result } = renderHook(() => useFoodTracker({ autoFetch: false }));

            expect(result.current.entries).toEqual(mockEntries);
        });

        it('returns daily totals from store', () => {
            const { result } = renderHook(() => useFoodTracker({ autoFetch: false }));

            expect(result.current.dailyTotals).toEqual(mockDailyTotals);
        });

        it('returns target goals from store', () => {
            const { result } = renderHook(() => useFoodTracker({ autoFetch: false }));

            expect(result.current.targetGoals).toEqual(mockTargetGoals);
        });

        it('returns selected date from store', () => {
            const { result } = renderHook(() => useFoodTracker({ autoFetch: false }));

            expect(result.current.selectedDate).toBe('2024-01-15');
        });

        it('returns loading state from store', () => {
            const { result } = renderHook(() => useFoodTracker({ autoFetch: false }));

            expect(result.current.isLoading).toBe(false);
        });

        it('returns error state from store', () => {
            const { result } = renderHook(() => useFoodTracker({ autoFetch: false }));

            expect(result.current.error).toBeNull();
        });

        it('returns offline state from store', () => {
            const { result } = renderHook(() => useFoodTracker({ autoFetch: false }));

            expect(result.current.isOffline).toBe(false);
        });
    });

    describe('auto-fetch', () => {
        it('fetches data on mount when autoFetch is true', () => {
            renderHook(() => useFoodTracker({ autoFetch: true }));

            expect(mockFetchDayData).toHaveBeenCalled();
        });

        it('does not fetch data on mount when autoFetch is false', () => {
            renderHook(() => useFoodTracker({ autoFetch: false }));

            expect(mockFetchDayData).not.toHaveBeenCalled();
        });

        it('uses initial date for fetch', () => {
            renderHook(() => useFoodTracker({ autoFetch: true, initialDate: '2024-01-20' }));

            expect(mockFetchDayData).toHaveBeenCalledWith('2024-01-20');
        });
    });

    describe('fetchDayData', () => {
        it('calls store fetchDayData with date', async () => {
            const { result } = renderHook(() => useFoodTracker({ autoFetch: false }));

            await act(async () => {
                await result.current.fetchDayData('2024-01-16');
            });

            expect(mockFetchDayData).toHaveBeenCalledWith('2024-01-16');
        });
    });

    describe('addEntry', () => {
        it('calls store addEntry with meal type and entry data', async () => {
            const mockEntry: FoodEntry = {
                id: '2',
                foodId: 'food-2',
                foodName: 'Яблоко',
                mealType: 'snack',
                portionType: 'grams',
                portionAmount: 150,
                nutrition: { calories: 78, protein: 0.4, fat: 0.3, carbs: 20 },
                time: '15:00',
                date: '2024-01-15',
                createdAt: '2024-01-15T15:00:00Z',
                updatedAt: '2024-01-15T15:00:00Z',
            };

            mockAddEntry.mockResolvedValue(mockEntry);

            const { result } = renderHook(() => useFoodTracker({ autoFetch: false }));

            const entryData: CreateFoodEntryRequest = {
                foodId: 'food-2',
                mealType: 'snack',
                portionType: 'grams',
                portionAmount: 150,
                time: '15:00',
                date: '2024-01-15',
            };

            let addedEntry: FoodEntry | null = null;
            await act(async () => {
                addedEntry = await result.current.addEntry('snack', entryData);
            });

            expect(mockAddEntry).toHaveBeenCalledWith('snack', entryData);
            expect(addedEntry).toEqual(mockEntry);
        });
    });

    describe('updateEntry', () => {
        it('calls store updateEntry with id and updates', async () => {
            const mockUpdatedEntry: FoodEntry = {
                id: '1',
                foodId: 'food-1',
                foodName: 'Овсянка',
                mealType: 'breakfast',
                portionType: 'grams',
                portionAmount: 200,
                nutrition: { calories: 700, protein: 24, fat: 12, carbs: 120 },
                time: '08:00',
                date: '2024-01-15',
                createdAt: '2024-01-15T08:00:00Z',
                updatedAt: '2024-01-15T08:30:00Z',
            };

            mockUpdateEntry.mockResolvedValue(mockUpdatedEntry);

            const { result } = renderHook(() => useFoodTracker({ autoFetch: false }));

            let updatedEntry: FoodEntry | null = null;
            await act(async () => {
                updatedEntry = await result.current.updateEntry('1', { portionAmount: 200 });
            });

            expect(mockUpdateEntry).toHaveBeenCalledWith('1', { portionAmount: 200 });
            expect(updatedEntry).toEqual(mockUpdatedEntry);
        });
    });

    describe('deleteEntry', () => {
        it('calls store deleteEntry with id and meal type', async () => {
            mockDeleteEntry.mockResolvedValue(true);

            const { result } = renderHook(() => useFoodTracker({ autoFetch: false }));

            let deleted = false;
            await act(async () => {
                deleted = await result.current.deleteEntry('1', 'breakfast');
            });

            expect(mockDeleteEntry).toHaveBeenCalledWith('1', 'breakfast');
            expect(deleted).toBe(true);
        });
    });

    describe('setSelectedDate', () => {
        it('calls store setSelectedDate', () => {
            const { result } = renderHook(() => useFoodTracker({ autoFetch: false }));

            act(() => {
                result.current.setSelectedDate('2024-01-20');
            });

            expect(mockSetSelectedDate).toHaveBeenCalledWith('2024-01-20');
        });
    });

    describe('setTargetGoals', () => {
        it('calls store setTargetGoals', () => {
            const { result } = renderHook(() => useFoodTracker({ autoFetch: false }));

            act(() => {
                result.current.setTargetGoals({ calories: 2500 });
            });

            expect(mockSetTargetGoals).toHaveBeenCalledWith({ calories: 2500 });
        });
    });

    describe('clearError', () => {
        it('calls store clearError', () => {
            const { result } = renderHook(() => useFoodTracker({ autoFetch: false }));

            act(() => {
                result.current.clearError();
            });

            expect(mockClearError).toHaveBeenCalled();
        });
    });

    describe('getEntriesForMeal', () => {
        it('returns entries for specified meal type', () => {
            const { result } = renderHook(() => useFoodTracker({ autoFetch: false }));

            const breakfastEntries = result.current.getEntriesForMeal('breakfast');

            expect(breakfastEntries).toEqual(mockEntries.breakfast);
        });

        it('returns empty array for meal type with no entries', () => {
            const { result } = renderHook(() => useFoodTracker({ autoFetch: false }));

            const lunchEntries = result.current.getEntriesForMeal('lunch');

            expect(lunchEntries).toEqual([]);
        });
    });

    describe('getTotalEntriesCount', () => {
        it('returns total count of all entries', () => {
            const { result } = renderHook(() => useFoodTracker({ autoFetch: false }));

            const count = result.current.getTotalEntriesCount();

            expect(count).toBe(1); // Only one entry in breakfast
        });

        it('returns zero when no entries exist', () => {
            (useFoodTrackerStore as unknown as jest.Mock).mockImplementation((selector) => {
                const state = {
                    entries: { breakfast: [], lunch: [], dinner: [], snack: [] },
                    dailyTotals: { calories: 0, protein: 0, fat: 0, carbs: 0 },
                    targetGoals: mockTargetGoals,
                    selectedDate: '2024-01-15',
                    isLoading: false,
                    error: null,
                    isOffline: false,
                    fetchDayData: mockFetchDayData,
                    addEntry: mockAddEntry,
                    updateEntry: mockUpdateEntry,
                    deleteEntry: mockDeleteEntry,
                    setSelectedDate: mockSetSelectedDate,
                    setTargetGoals: mockSetTargetGoals,
                    clearError: mockClearError,
                };
                return selector(state);
            });

            const { result } = renderHook(() => useFoodTracker({ autoFetch: false }));

            const count = result.current.getTotalEntriesCount();

            expect(count).toBe(0);
        });

        it('counts entries across all meal types', () => {
            const multipleEntries = {
                breakfast: [mockEntries.breakfast[0]],
                lunch: [{ ...mockEntries.breakfast[0], id: '2', mealType: 'lunch' as MealType }],
                dinner: [{ ...mockEntries.breakfast[0], id: '3', mealType: 'dinner' as MealType }],
                snack: [
                    { ...mockEntries.breakfast[0], id: '4', mealType: 'snack' as MealType },
                    { ...mockEntries.breakfast[0], id: '5', mealType: 'snack' as MealType },
                ],
            };

            (useFoodTrackerStore as unknown as jest.Mock).mockImplementation((selector) => {
                const state = {
                    entries: multipleEntries,
                    dailyTotals: mockDailyTotals,
                    targetGoals: mockTargetGoals,
                    selectedDate: '2024-01-15',
                    isLoading: false,
                    error: null,
                    isOffline: false,
                    fetchDayData: mockFetchDayData,
                    addEntry: mockAddEntry,
                    updateEntry: mockUpdateEntry,
                    deleteEntry: mockDeleteEntry,
                    setSelectedDate: mockSetSelectedDate,
                    setTargetGoals: mockSetTargetGoals,
                    clearError: mockClearError,
                };
                return selector(state);
            });

            const { result } = renderHook(() => useFoodTracker({ autoFetch: false }));

            const count = result.current.getTotalEntriesCount();

            expect(count).toBe(5);
        });
    });

    describe('default options', () => {
        it('uses today as default initial date when not provided', () => {
            const today = new Date().toISOString().split('T')[0];

            renderHook(() => useFoodTracker());

            expect(mockFetchDayData).toHaveBeenCalledWith(today);
        });

        it('auto-fetches by default when no options provided', () => {
            renderHook(() => useFoodTracker());

            expect(mockFetchDayData).toHaveBeenCalled();
        });
    });

    describe('edge cases', () => {
        it('handles undefined meal type entries gracefully', () => {
            // Simulate a case where entries might have undefined values
            const entriesWithUndefined = {
                breakfast: mockEntries.breakfast,
                lunch: [],
                dinner: [],
                snack: [],
            };

            (useFoodTrackerStore as unknown as jest.Mock).mockImplementation((selector) => {
                const state = {
                    entries: entriesWithUndefined,
                    dailyTotals: mockDailyTotals,
                    targetGoals: mockTargetGoals,
                    selectedDate: '2024-01-15',
                    isLoading: false,
                    error: null,
                    isOffline: false,
                    fetchDayData: mockFetchDayData,
                    addEntry: mockAddEntry,
                    updateEntry: mockUpdateEntry,
                    deleteEntry: mockDeleteEntry,
                    setSelectedDate: mockSetSelectedDate,
                    setTargetGoals: mockSetTargetGoals,
                    clearError: mockClearError,
                };
                return selector(state);
            });

            const { result } = renderHook(() => useFoodTracker({ autoFetch: false }));

            // Should not throw and return empty array for undefined
            expect(result.current.getEntriesForMeal('lunch')).toEqual([]);
        });

        it('returns empty array when entries object has missing meal type', () => {
            // Simulate a case where a meal type key is missing from entries
            const incompleteEntries = {
                breakfast: mockEntries.breakfast,
                // lunch is missing
                dinner: [],
                snack: [],
            } as any;

            (useFoodTrackerStore as unknown as jest.Mock).mockImplementation((selector) => {
                const state = {
                    entries: incompleteEntries,
                    dailyTotals: mockDailyTotals,
                    targetGoals: mockTargetGoals,
                    selectedDate: '2024-01-15',
                    isLoading: false,
                    error: null,
                    isOffline: false,
                    fetchDayData: mockFetchDayData,
                    addEntry: mockAddEntry,
                    updateEntry: mockUpdateEntry,
                    deleteEntry: mockDeleteEntry,
                    setSelectedDate: mockSetSelectedDate,
                    setTargetGoals: mockSetTargetGoals,
                    clearError: mockClearError,
                };
                return selector(state);
            });

            const { result } = renderHook(() => useFoodTracker({ autoFetch: false }));

            // Should return empty array for missing meal type (fallback to [])
            expect(result.current.getEntriesForMeal('lunch')).toEqual([]);
        });

        it('handles error state from store', () => {
            const mockError = {
                code: 'NETWORK_ERROR' as const,
                message: 'Нет подключения к интернету',
            };

            (useFoodTrackerStore as unknown as jest.Mock).mockImplementation((selector) => {
                const state = {
                    entries: mockEntries,
                    dailyTotals: mockDailyTotals,
                    targetGoals: mockTargetGoals,
                    selectedDate: '2024-01-15',
                    isLoading: false,
                    error: mockError,
                    isOffline: true,
                    fetchDayData: mockFetchDayData,
                    addEntry: mockAddEntry,
                    updateEntry: mockUpdateEntry,
                    deleteEntry: mockDeleteEntry,
                    setSelectedDate: mockSetSelectedDate,
                    setTargetGoals: mockSetTargetGoals,
                    clearError: mockClearError,
                };
                return selector(state);
            });

            const { result } = renderHook(() => useFoodTracker({ autoFetch: false }));

            expect(result.current.error).toEqual(mockError);
            expect(result.current.isOffline).toBe(true);
        });

        it('handles loading state from store', () => {
            (useFoodTrackerStore as unknown as jest.Mock).mockImplementation((selector) => {
                const state = {
                    entries: mockEntries,
                    dailyTotals: mockDailyTotals,
                    targetGoals: mockTargetGoals,
                    selectedDate: '2024-01-15',
                    isLoading: true,
                    error: null,
                    isOffline: false,
                    fetchDayData: mockFetchDayData,
                    addEntry: mockAddEntry,
                    updateEntry: mockUpdateEntry,
                    deleteEntry: mockDeleteEntry,
                    setSelectedDate: mockSetSelectedDate,
                    setTargetGoals: mockSetTargetGoals,
                    clearError: mockClearError,
                };
                return selector(state);
            });

            const { result } = renderHook(() => useFoodTracker({ autoFetch: false }));

            expect(result.current.isLoading).toBe(true);
        });

        it('returns null when addEntry fails', async () => {
            mockAddEntry.mockResolvedValue(null);

            const { result } = renderHook(() => useFoodTracker({ autoFetch: false }));

            const entryData: CreateFoodEntryRequest = {
                foodId: 'food-2',
                mealType: 'snack',
                portionType: 'grams',
                portionAmount: 150,
                time: '15:00',
                date: '2024-01-15',
            };

            let addedEntry: FoodEntry | null = null;
            await act(async () => {
                addedEntry = await result.current.addEntry('snack', entryData);
            });

            expect(addedEntry).toBeNull();
        });

        it('returns null when updateEntry fails', async () => {
            mockUpdateEntry.mockResolvedValue(null);

            const { result } = renderHook(() => useFoodTracker({ autoFetch: false }));

            let updatedEntry: FoodEntry | null = null;
            await act(async () => {
                updatedEntry = await result.current.updateEntry('1', { portionAmount: 200 });
            });

            expect(updatedEntry).toBeNull();
        });

        it('returns false when deleteEntry fails', async () => {
            mockDeleteEntry.mockResolvedValue(false);

            const { result } = renderHook(() => useFoodTracker({ autoFetch: false }));

            let deleted = false;
            await act(async () => {
                deleted = await result.current.deleteEntry('1', 'breakfast');
            });

            expect(deleted).toBe(false);
        });
    });
});
