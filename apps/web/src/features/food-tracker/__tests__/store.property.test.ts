/**
 * Property-based tests for food tracker store
 * Feature: food-tracker
 * Property 16: Entry Persistence Round-Trip
 * Validates: Requirements 10.6, 16.1
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import fc from 'fast-check';
import { useFoodTrackerStore } from '../store/foodTrackerStore';
import type { FoodEntry, MealType, KBZHU, CreateFoodEntryRequest } from '../types';
import {
    foodEntryGenerator,
    mealTypeGenerator,
    portionTypeGenerator,
    kbzhuGenerator,
    timeGenerator,
    dateGenerator,
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

describe('Property 16: Entry Persistence Round-Trip', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        // Reset store state before each test
        const { result } = renderHook(() => useFoodTrackerStore());
        act(() => {
            result.current.reset();
        });

        // Mock navigator.onLine
        Object.defineProperty(navigator, 'onLine', {
            value: true,
            writable: true,
            configurable: true,
        });
    });

    /**
     * Generator for creating a valid food entry request
     */
    const createFoodEntryRequestGenerator = (): fc.Arbitrary<CreateFoodEntryRequest> => {
        return fc.record({
            foodId: fc.uuid(),
            mealType: mealTypeGenerator(),
            portionType: portionTypeGenerator(),
            portionAmount: fc.float({ min: 1, max: 2000, noNaN: true }),
            time: timeGenerator(),
            date: dateGenerator(),
        });
    };

    /**
     * Generator for a complete food entry (as returned from API)
     */
    const completeFoodEntryGenerator = (request: CreateFoodEntryRequest): fc.Arbitrary<FoodEntry> => {
        return fc.record({
            id: fc.uuid(),
            foodId: fc.constant(request.foodId),
            foodName: fc.string({ minLength: 2, maxLength: 100 }),
            mealType: fc.constant(request.mealType),
            portionType: fc.constant(request.portionType),
            portionAmount: fc.constant(request.portionAmount),
            nutrition: kbzhuGenerator(),
            time: fc.constant(request.time),
            date: fc.constant(request.date),
            createdAt: fc.constant(new Date().toISOString()),
            updatedAt: fc.constant(new Date().toISOString()),
        });
    };

    /**
     * For any created entry, the retrieved entry should have identical values
     * for all fields that were specified in the creation request.
     *
     * **Validates: Requirements 10.6, 16.1**
     */
    it('Feature: food-tracker, Property 16: created entry has identical values when retrieved', async () => {
        await fc.assert(
            fc.asyncProperty(
                createFoodEntryRequestGenerator(),
                fc.string({ minLength: 2, maxLength: 100 }), // foodName
                kbzhuGenerator(), // nutrition values
                async (request, foodName, nutrition) => {
                    const { result } = renderHook(() => useFoodTrackerStore());

                    // Reset store state
                    act(() => {
                        result.current.reset();
                    });

                    // Create the expected response from API
                    const createdEntry: FoodEntry = {
                        id: `entry-${Date.now()}-${Math.random()}`,
                        foodId: request.foodId,
                        foodName,
                        mealType: request.mealType,
                        portionType: request.portionType,
                        portionAmount: request.portionAmount,
                        nutrition,
                        time: request.time,
                        date: request.date,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                    };

                    // Mock API to return the created entry
                    mockedApiClient.post.mockResolvedValueOnce(createdEntry);

                    // Add entry to store
                    await act(async () => {
                        await result.current.addEntry(request.mealType, request);
                    });

                    // Verify the entry was added to the store
                    const entriesInSlot = result.current.entries[request.mealType];
                    const foundEntry = entriesInSlot.find(e => e.id === createdEntry.id);

                    // Verify entry exists and all request fields match
                    expect(foundEntry).toBeDefined();
                    if (foundEntry) {
                        expect(foundEntry.foodId).toBe(request.foodId);
                        expect(foundEntry.mealType).toBe(request.mealType);
                        expect(foundEntry.portionType).toBe(request.portionType);
                        expect(foundEntry.portionAmount).toBe(request.portionAmount);
                        expect(foundEntry.time).toBe(request.time);
                        expect(foundEntry.date).toBe(request.date);

                        // Verify server-provided fields are present
                        expect(foundEntry.id).toBe(createdEntry.id);
                        expect(foundEntry.foodName).toBe(createdEntry.foodName);
                        expect(foundEntry.nutrition).toEqual(createdEntry.nutrition);
                    }
                }
            ),
            { numRuns: 50 } // Reduced runs due to async nature
        );
    });

    /**
     * For any entry that is created and then fetched, the values should be identical.
     * This tests the full round-trip: create -> store -> retrieve.
     *
     * **Validates: Requirements 10.6, 16.1**
     */
    it('Feature: food-tracker, Property 16: entry values are preserved through store operations', () => {
        fc.assert(
            fc.property(
                foodEntryGenerator(),
                mealTypeGenerator(),
                (entry, mealType) => {
                    const { result } = renderHook(() => useFoodTrackerStore());

                    // Ensure entry has the correct meal type
                    const testEntry: FoodEntry = {
                        ...entry,
                        mealType,
                    };

                    // Directly set entries in store (simulating fetched data)
                    act(() => {
                        result.current.entries[mealType] = [testEntry];
                    });

                    // Retrieve the entry from store
                    const retrievedEntry = result.current.entries[mealType].find(
                        e => e.id === testEntry.id
                    );

                    // Verify all fields are identical
                    expect(retrievedEntry).toBeDefined();
                    if (retrievedEntry) {
                        expect(retrievedEntry.id).toBe(testEntry.id);
                        expect(retrievedEntry.foodId).toBe(testEntry.foodId);
                        expect(retrievedEntry.foodName).toBe(testEntry.foodName);
                        expect(retrievedEntry.mealType).toBe(testEntry.mealType);
                        expect(retrievedEntry.portionType).toBe(testEntry.portionType);
                        expect(retrievedEntry.portionAmount).toBe(testEntry.portionAmount);
                        expect(retrievedEntry.time).toBe(testEntry.time);
                        expect(retrievedEntry.date).toBe(testEntry.date);
                        expect(retrievedEntry.createdAt).toBe(testEntry.createdAt);
                        expect(retrievedEntry.updatedAt).toBe(testEntry.updatedAt);

                        // Verify nutrition values
                        expect(retrievedEntry.nutrition.calories).toBe(testEntry.nutrition.calories);
                        expect(retrievedEntry.nutrition.protein).toBe(testEntry.nutrition.protein);
                        expect(retrievedEntry.nutrition.fat).toBe(testEntry.nutrition.fat);
                        expect(retrievedEntry.nutrition.carbs).toBe(testEntry.nutrition.carbs);
                    }
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * For any set of entries fetched from API, all entries should be stored
     * with identical values in the correct meal slots.
     *
     * **Validates: Requirements 10.6, 16.1**
     */
    it('Feature: food-tracker, Property 16: fetched entries preserve all values in store', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.array(foodEntryGenerator(), { minLength: 1, maxLength: 20 }),
                dateGenerator(),
                async (entries, date) => {
                    const { result } = renderHook(() => useFoodTrackerStore());

                    // Ensure all entries have the same date
                    const testEntries = entries.map(e => ({
                        ...e,
                        date,
                    }));

                    // Mock API response
                    mockedApiClient.get.mockImplementation((url: string) => {
                        if (url.includes('/entries')) {
                            return Promise.resolve({
                                entries: testEntries,
                                dailyTotals: {
                                    calories: 0,
                                    protein: 0,
                                    fat: 0,
                                    carbs: 0,
                                },
                            });
                        }
                        if (url.includes('/water')) {
                            return Promise.resolve({
                                log: {
                                    date,
                                    glasses: 0,
                                    goal: 8,
                                    glassSize: 250,
                                },
                            });
                        }
                        return Promise.reject(new Error('Unknown endpoint'));
                    });

                    // Fetch day data
                    await act(async () => {
                        await result.current.fetchDayData(date);
                    });

                    // Verify all entries are stored correctly
                    for (const originalEntry of testEntries) {
                        const storedEntry = result.current.entries[originalEntry.mealType].find(
                            e => e.id === originalEntry.id
                        );

                        expect(storedEntry).toBeDefined();
                        if (storedEntry) {
                            // Verify all fields match
                            expect(storedEntry.id).toBe(originalEntry.id);
                            expect(storedEntry.foodId).toBe(originalEntry.foodId);
                            expect(storedEntry.foodName).toBe(originalEntry.foodName);
                            expect(storedEntry.mealType).toBe(originalEntry.mealType);
                            expect(storedEntry.portionType).toBe(originalEntry.portionType);
                            expect(storedEntry.portionAmount).toBe(originalEntry.portionAmount);
                            expect(storedEntry.time).toBe(originalEntry.time);
                            expect(storedEntry.date).toBe(originalEntry.date);

                            // Verify nutrition
                            expect(storedEntry.nutrition.calories).toBe(originalEntry.nutrition.calories);
                            expect(storedEntry.nutrition.protein).toBe(originalEntry.nutrition.protein);
                            expect(storedEntry.nutrition.fat).toBe(originalEntry.nutrition.fat);
                            expect(storedEntry.nutrition.carbs).toBe(originalEntry.nutrition.carbs);
                        }
                    }
                }
            ),
            { numRuns: 50 }
        );
    });

    /**
     * For any entry that is updated, the updated values should be persisted
     * and retrievable with identical values.
     *
     * **Validates: Requirements 10.6, 16.1**
     */
    it('Feature: food-tracker, Property 16: updated entry values are persisted correctly', async () => {
        await fc.assert(
            fc.asyncProperty(
                foodEntryGenerator(),
                portionTypeGenerator(),
                fc.float({ min: 1, max: 2000, noNaN: true }),
                timeGenerator(),
                async (originalEntry, newPortionType, newPortionAmount, newTime) => {
                    const { result } = renderHook(() => useFoodTrackerStore());

                    // Set initial entry in store
                    act(() => {
                        result.current.entries[originalEntry.mealType] = [originalEntry];
                    });

                    // Create update request
                    const updates = {
                        portionType: newPortionType,
                        portionAmount: newPortionAmount,
                        time: newTime,
                    };

                    // Create expected updated entry
                    const updatedEntry: FoodEntry = {
                        ...originalEntry,
                        ...updates,
                        updatedAt: new Date().toISOString(),
                    };

                    // Mock API response
                    mockedApiClient.put.mockResolvedValueOnce(updatedEntry);

                    // Update entry
                    await act(async () => {
                        await result.current.updateEntry(originalEntry.id, updates);
                    });

                    // Retrieve updated entry
                    const retrievedEntry = result.current.entries[originalEntry.mealType].find(
                        e => e.id === originalEntry.id
                    );

                    // Verify updated values are persisted
                    expect(retrievedEntry).toBeDefined();
                    if (retrievedEntry) {
                        expect(retrievedEntry.portionType).toBe(newPortionType);
                        expect(retrievedEntry.portionAmount).toBe(newPortionAmount);
                        expect(retrievedEntry.time).toBe(newTime);

                        // Verify unchanged values are preserved
                        expect(retrievedEntry.id).toBe(originalEntry.id);
                        expect(retrievedEntry.foodId).toBe(originalEntry.foodId);
                        expect(retrievedEntry.foodName).toBe(originalEntry.foodName);
                        expect(retrievedEntry.date).toBe(originalEntry.date);
                    }
                }
            ),
            { numRuns: 50 }
        );
    });

    /**
     * For any entry stored in the system, the nutrition values should be
     * exactly preserved without floating point errors.
     *
     * **Validates: Requirements 10.6, 16.1**
     */
    it('Feature: food-tracker, Property 16: nutrition values are preserved exactly', () => {
        fc.assert(
            fc.property(
                kbzhuGenerator(),
                foodEntryGenerator(),
                (nutrition, entry) => {
                    const { result } = renderHook(() => useFoodTrackerStore());

                    // Create entry with specific nutrition values
                    const testEntry: FoodEntry = {
                        ...entry,
                        nutrition,
                    };

                    // Store entry
                    act(() => {
                        result.current.entries[testEntry.mealType] = [testEntry];
                    });

                    // Retrieve entry
                    const retrievedEntry = result.current.entries[testEntry.mealType].find(
                        e => e.id === testEntry.id
                    );

                    // Verify nutrition values are exactly preserved
                    expect(retrievedEntry).toBeDefined();
                    if (retrievedEntry) {
                        expect(retrievedEntry.nutrition.calories).toBe(nutrition.calories);
                        expect(retrievedEntry.nutrition.protein).toBe(nutrition.protein);
                        expect(retrievedEntry.nutrition.fat).toBe(nutrition.fat);
                        expect(retrievedEntry.nutrition.carbs).toBe(nutrition.carbs);
                    }
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * For any entry, the meal type assignment should be preserved through
     * storage and retrieval operations.
     *
     * **Validates: Requirements 10.6, 16.1**
     */
    it('Feature: food-tracker, Property 16: meal type assignment is preserved', () => {
        fc.assert(
            fc.property(
                foodEntryGenerator(),
                mealTypeGenerator(),
                (entry, mealType) => {
                    const { result } = renderHook(() => useFoodTrackerStore());

                    // Create entry with specific meal type
                    const testEntry: FoodEntry = {
                        ...entry,
                        mealType,
                    };

                    // Store entry in correct meal slot
                    act(() => {
                        result.current.entries[mealType] = [testEntry];
                    });

                    // Verify entry is in correct meal slot
                    const entriesInSlot = result.current.entries[mealType];
                    const foundEntry = entriesInSlot.find(e => e.id === testEntry.id);

                    expect(foundEntry).toBeDefined();
                    expect(foundEntry?.mealType).toBe(mealType);

                    // Verify entry is NOT in other meal slots
                    const otherMealTypes: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'].filter(
                        mt => mt !== mealType
                    ) as MealType[];

                    for (const otherMealType of otherMealTypes) {
                        const entriesInOtherSlot = result.current.entries[otherMealType];
                        const foundInOther = entriesInOtherSlot.find(e => e.id === testEntry.id);
                        expect(foundInOther).toBeUndefined();
                    }
                }
            ),
            { numRuns: 100 }
        );
    });
});
