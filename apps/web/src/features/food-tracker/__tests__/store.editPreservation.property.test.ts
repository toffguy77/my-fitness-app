/**
 * Property-based tests for food entry edit preservation
 * Feature: food-tracker
 * Property 19: Food Entry Edit Preservation
 * Validates: Requirements 10.2, 10.3
 */

import { renderHook, act } from '@testing-library/react';
import fc from 'fast-check';
import { useFoodTrackerStore } from '../store/foodTrackerStore';
import type { FoodEntry, MealType, KBZHU, PortionType } from '../types';
import {
    mealTypeGenerator,
    portionTypeGenerator,
    kbzhuGenerator,
    timeGenerator,
    validPortionGenerator,
} from '../testing/generators';

// Mock the API client
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
    getApiUrl: (path: string) => `http://localhost:4000/api${path}`,
}));

// Mock react-hot-toast
jest.mock('react-hot-toast', () => ({
    __esModule: true,
    default: {
        success: jest.fn(),
        error: jest.fn(),
    },
}));

// Import mocked modules
import { apiClient } from '@/shared/utils/api-client';

const mockedApiClient = apiClient as jest.Mocked<typeof apiClient>;

/**
 * Counter for generating unique IDs
 */
let idCounter = 0;

/**
 * Helper to generate unique entry ID
 */
function generateUniqueId(): string {
    idCounter++;
    return `test-entry-${idCounter}-${Date.now()}`;
}

/**
 * Helper to calculate daily totals from entries (matching store logic)
 */
function calculateDailyTotals(entries: Record<MealType, FoodEntry[]>): KBZHU {
    const totals: KBZHU = { calories: 0, protein: 0, fat: 0, carbs: 0 };
    for (const mealType of Object.keys(entries) as MealType[]) {
        for (const entry of entries[mealType]) {
            totals.calories += entry.nutrition.calories;
            totals.protein += entry.nutrition.protein;
            totals.fat += entry.nutrition.fat;
            totals.carbs += entry.nutrition.carbs;
        }
    }
    totals.calories = Math.round(totals.calories * 10) / 10;
    totals.protein = Math.round(totals.protein * 10) / 10;
    totals.fat = Math.round(totals.fat * 10) / 10;
    totals.carbs = Math.round(totals.carbs * 10) / 10;
    return totals;
}

/**
 * Helper to create a test entry with unique ID
 */
function createTestEntry(
    mealType: MealType,
    portionType: PortionType = 'grams',
    portionAmount: number = 100,
    nutrition: KBZHU = { calories: 200, protein: 10, fat: 5, carbs: 30 },
    time: string = '12:00'
): FoodEntry {
    const id = generateUniqueId();
    return {
        id,
        foodId: `food-${id}`,
        foodName: `Test Food ${id}`,
        mealType,
        portionType,
        portionAmount,
        nutrition,
        time,
        date: '2024-01-15',
        createdAt: '2024-01-15T10:00:00.000Z',
        updatedAt: '2024-01-15T10:00:00.000Z',
    };
}

/**
 * Helper to set up store with entries using Zustand's setState
 */
function setupStoreWithEntries(entries: Record<MealType, FoodEntry[]>): void {
    useFoodTrackerStore.setState({
        entries,
        dailyTotals: calculateDailyTotals(entries),
    });
}

describe('Property 19: Food Entry Edit Preservation', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        idCounter = 0;
        // Reset store state directly
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
            dailyTotals: { calories: 0, protein: 0, fat: 0, carbs: 0 },
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
        Object.defineProperty(navigator, 'onLine', {
            value: true, writable: true, configurable: true,
        });
    });


    /**
     * For any edit operation, the updated values SHALL be reflected in the entry.
     * **Validates: Requirements 10.2, 10.3**
     */
    it('Feature: food-tracker, Property 19: edited entry reflects updated values', async () => {
        await fc.assert(
            fc.asyncProperty(
                mealTypeGenerator(),
                portionTypeGenerator(),
                validPortionGenerator(),
                timeGenerator(),
                portionTypeGenerator(),
                validPortionGenerator(),
                timeGenerator(),
                async (mealType, origPortionType, origPortionAmount, origTime, newPortionType, newPortionAmount, newTime) => {
                    const originalEntry = createTestEntry(mealType, origPortionType, origPortionAmount, undefined, origTime);

                    // Set up store with the entry
                    const entries: Record<MealType, FoodEntry[]> = {
                        breakfast: [],
                        lunch: [],
                        dinner: [],
                        snack: [],
                    };
                    entries[mealType] = [originalEntry];
                    setupStoreWithEntries(entries);

                    const updates = {
                        portionType: newPortionType,
                        portionAmount: newPortionAmount,
                        time: newTime,
                    };

                    const updatedEntry: FoodEntry = {
                        ...originalEntry,
                        ...updates,
                        updatedAt: new Date().toISOString(),
                    };

                    mockedApiClient.put.mockResolvedValueOnce(updatedEntry);

                    const { result } = renderHook(() => useFoodTrackerStore());

                    await act(async () => {
                        await result.current.updateEntry(originalEntry.id, updates);
                    });

                    const editedEntry = result.current.entries[mealType].find(
                        e => e.id === originalEntry.id
                    );

                    expect(editedEntry).toBeDefined();
                    if (editedEntry) {
                        expect(editedEntry.portionType).toBe(newPortionType);
                        expect(editedEntry.portionAmount).toBe(newPortionAmount);
                        expect(editedEntry.time).toBe(newTime);
                    }
                }
            ),
            { numRuns: 20 }
        );
    }, 30000);

    /**
     * For any edit operation, the daily totals SHALL be recalculated.
     * **Validates: Requirements 10.2, 10.3**
     */
    it('Feature: food-tracker, Property 19: daily totals are recalculated after edit', async () => {
        await fc.assert(
            fc.asyncProperty(
                mealTypeGenerator(),
                kbzhuGenerator(),
                kbzhuGenerator(),
                async (mealType, origNutrition, newNutrition) => {
                    const originalEntry = createTestEntry(mealType, 'grams', 100, origNutrition);

                    // Set up store with the entry
                    const entries: Record<MealType, FoodEntry[]> = {
                        breakfast: [],
                        lunch: [],
                        dinner: [],
                        snack: [],
                    };
                    entries[mealType] = [originalEntry];
                    setupStoreWithEntries(entries);

                    const updatedEntry: FoodEntry = {
                        ...originalEntry,
                        nutrition: newNutrition,
                        updatedAt: new Date().toISOString(),
                    };

                    mockedApiClient.put.mockResolvedValueOnce(updatedEntry);

                    const { result } = renderHook(() => useFoodTrackerStore());

                    await act(async () => {
                        await result.current.updateEntry(originalEntry.id, {
                            portionAmount: originalEntry.portionAmount,
                        });
                    });

                    const expectedTotals = calculateDailyTotals(result.current.entries);
                    const actualTotals = result.current.dailyTotals;

                    expect(actualTotals.calories).toBe(expectedTotals.calories);
                    expect(actualTotals.protein).toBe(expectedTotals.protein);
                    expect(actualTotals.fat).toBe(expectedTotals.fat);
                    expect(actualTotals.carbs).toBe(expectedTotals.carbs);
                }
            ),
            { numRuns: 20 }
        );
    }, 30000);


    /**
     * For any edit operation, unchanged fields SHALL be preserved.
     * **Validates: Requirements 10.2, 10.3**
     */
    it('Feature: food-tracker, Property 19: unchanged fields are preserved after edit', async () => {
        await fc.assert(
            fc.asyncProperty(
                mealTypeGenerator(),
                portionTypeGenerator(),
                validPortionGenerator(),
                validPortionGenerator(),
                async (mealType, origPortionType, origPortionAmount, newPortionAmount) => {
                    const originalEntry = createTestEntry(mealType, origPortionType, origPortionAmount);

                    // Set up store with the entry
                    const entries: Record<MealType, FoodEntry[]> = {
                        breakfast: [],
                        lunch: [],
                        dinner: [],
                        snack: [],
                    };
                    entries[mealType] = [originalEntry];
                    setupStoreWithEntries(entries);

                    const updates = { portionAmount: newPortionAmount };

                    const updatedEntry: FoodEntry = {
                        ...originalEntry,
                        portionAmount: newPortionAmount,
                        updatedAt: new Date().toISOString(),
                    };

                    mockedApiClient.put.mockResolvedValueOnce(updatedEntry);

                    const { result } = renderHook(() => useFoodTrackerStore());

                    await act(async () => {
                        await result.current.updateEntry(originalEntry.id, updates);
                    });

                    const editedEntry = result.current.entries[mealType].find(
                        e => e.id === originalEntry.id
                    );

                    expect(editedEntry).toBeDefined();
                    if (editedEntry) {
                        expect(editedEntry.portionAmount).toBe(newPortionAmount);
                        expect(editedEntry.id).toBe(originalEntry.id);
                        expect(editedEntry.foodId).toBe(originalEntry.foodId);
                        expect(editedEntry.foodName).toBe(originalEntry.foodName);
                        expect(editedEntry.mealType).toBe(originalEntry.mealType);
                        expect(editedEntry.portionType).toBe(originalEntry.portionType);
                        expect(editedEntry.date).toBe(originalEntry.date);
                        expect(editedEntry.createdAt).toBe(originalEntry.createdAt);
                    }
                }
            ),
            { numRuns: 20 }
        );
    }, 30000);

    /**
     * For multiple entries, editing one entry SHALL only affect that entry's values.
     * **Validates: Requirements 10.2, 10.3**
     */
    it('Feature: food-tracker, Property 19: editing one entry does not affect other entries', async () => {
        await fc.assert(
            fc.asyncProperty(
                mealTypeGenerator(),
                fc.integer({ min: 2, max: 4 }),
                validPortionGenerator(),
                async (mealType, numEntries, newPortionAmount) => {
                    const testEntries: FoodEntry[] = [];
                    for (let i = 0; i < numEntries; i++) {
                        testEntries.push(createTestEntry(mealType, 'grams', 100 + i * 10));
                    }

                    // Set up store with the entries
                    const entries: Record<MealType, FoodEntry[]> = {
                        breakfast: [],
                        lunch: [],
                        dinner: [],
                        snack: [],
                    };
                    entries[mealType] = [...testEntries];
                    setupStoreWithEntries(entries);

                    const entryToEdit = testEntries[0];
                    const otherEntries = testEntries.slice(1).map(e => ({ ...e }));

                    const updatedEntry: FoodEntry = {
                        ...entryToEdit,
                        portionAmount: newPortionAmount,
                        updatedAt: new Date().toISOString(),
                    };

                    mockedApiClient.put.mockResolvedValueOnce(updatedEntry);

                    const { result } = renderHook(() => useFoodTrackerStore());

                    await act(async () => {
                        await result.current.updateEntry(entryToEdit.id, {
                            portionAmount: newPortionAmount,
                        });
                    });

                    for (const originalOther of otherEntries) {
                        const currentOther = result.current.entries[mealType].find(
                            e => e.id === originalOther.id
                        );
                        expect(currentOther).toBeDefined();
                        if (currentOther) {
                            expect(currentOther.portionAmount).toBe(originalOther.portionAmount);
                            expect(currentOther.portionType).toBe(originalOther.portionType);
                            expect(currentOther.time).toBe(originalOther.time);
                            expect(currentOther.nutrition).toEqual(originalOther.nutrition);
                        }
                    }
                }
            ),
            { numRuns: 15 }
        );
    }, 30000);


    /**
     * For any edit operation with multiple fields, all specified fields SHALL be updated.
     * **Validates: Requirements 10.2, 10.3**
     */
    it('Feature: food-tracker, Property 19: multiple field updates are applied correctly', async () => {
        await fc.assert(
            fc.asyncProperty(
                mealTypeGenerator(),
                portionTypeGenerator(),
                validPortionGenerator(),
                timeGenerator(),
                async (mealType, newPortionType, newPortionAmount, newTime) => {
                    const originalEntry = createTestEntry(mealType);

                    // Set up store with the entry
                    const entries: Record<MealType, FoodEntry[]> = {
                        breakfast: [],
                        lunch: [],
                        dinner: [],
                        snack: [],
                    };
                    entries[mealType] = [originalEntry];
                    setupStoreWithEntries(entries);

                    const updates = {
                        portionType: newPortionType,
                        portionAmount: newPortionAmount,
                        time: newTime,
                    };

                    const updatedEntry: FoodEntry = {
                        ...originalEntry,
                        ...updates,
                        updatedAt: new Date().toISOString(),
                    };

                    mockedApiClient.put.mockResolvedValueOnce(updatedEntry);

                    const { result } = renderHook(() => useFoodTrackerStore());

                    await act(async () => {
                        await result.current.updateEntry(originalEntry.id, updates);
                    });

                    const editedEntry = result.current.entries[mealType].find(
                        e => e.id === originalEntry.id
                    );

                    expect(editedEntry).toBeDefined();
                    if (editedEntry) {
                        expect(editedEntry.portionType).toBe(newPortionType);
                        expect(editedEntry.portionAmount).toBe(newPortionAmount);
                        expect(editedEntry.time).toBe(newTime);
                    }
                }
            ),
            { numRuns: 20 }
        );
    }, 30000);

    /**
     * For any edit operation, the entry SHALL remain in the same meal slot.
     * **Validates: Requirements 10.2, 10.3**
     */
    it('Feature: food-tracker, Property 19: edited entry remains in same meal slot', async () => {
        await fc.assert(
            fc.asyncProperty(
                mealTypeGenerator(),
                validPortionGenerator(),
                async (mealType, newPortionAmount) => {
                    const originalEntry = createTestEntry(mealType);

                    // Set up store with the entry
                    const entries: Record<MealType, FoodEntry[]> = {
                        breakfast: [],
                        lunch: [],
                        dinner: [],
                        snack: [],
                    };
                    entries[mealType] = [originalEntry];
                    setupStoreWithEntries(entries);

                    const updatedEntry: FoodEntry = {
                        ...originalEntry,
                        portionAmount: newPortionAmount,
                        updatedAt: new Date().toISOString(),
                    };

                    mockedApiClient.put.mockResolvedValueOnce(updatedEntry);

                    const { result } = renderHook(() => useFoodTrackerStore());

                    await act(async () => {
                        await result.current.updateEntry(originalEntry.id, {
                            portionAmount: newPortionAmount,
                        });
                    });

                    const entryInOriginalSlot = result.current.entries[mealType].find(
                        e => e.id === originalEntry.id
                    );
                    expect(entryInOriginalSlot).toBeDefined();

                    const otherMealTypes: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'].filter(
                        mt => mt !== mealType
                    ) as MealType[];

                    for (const otherMealType of otherMealTypes) {
                        const entryInOtherSlot = result.current.entries[otherMealType].find(
                            e => e.id === originalEntry.id
                        );
                        expect(entryInOtherSlot).toBeUndefined();
                    }
                }
            ),
            { numRuns: 20 }
        );
    }, 30000);
});
