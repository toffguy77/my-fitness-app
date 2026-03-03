/**
 * DietTab Component
 *
 * Main tab for daily diet tracking. Integrates KBZHUSummary, MealSlot components,
 * WaterTracker, and provides a FAB for quick food entry.
 *
 * @module food-tracker/components/DietTab
 */

'use client';

import React, { useCallback, useState } from 'react';
import { Plus } from 'lucide-react';
import { KBZHUSummary } from './KBZHUSummary';
import { MealSlot } from './MealSlot';
import { WaterTracker } from './WaterTracker';
import { FoodEntryModal } from './FoodEntryModal';
import { useFoodTrackerStore } from '../store/foodTrackerStore';
import type { MealType, FoodEntry, WaterLog } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface DietTabProps {
    /** Food entries grouped by meal type */
    entries: Record<MealType, FoodEntry[]>;
    /** Daily totals for КБЖУ */
    dailyTotals: {
        calories: number;
        protein: number;
        fat: number;
        carbs: number;
    };
    /** Target goals for КБЖУ */
    targetGoals: {
        calories: number;
        protein: number;
        fat: number;
        carbs: number;
    };
    /** Loading state */
    isLoading: boolean;
    /** Callback to add a new entry */
    onAddEntry: (mealType: MealType, entry: any) => Promise<FoodEntry | null>;
    /** Callback to update an entry */
    onUpdateEntry: (id: string, updates: any) => Promise<FoodEntry | null>;
    /** Callback to delete an entry */
    onDeleteEntry: (id: string, mealType: MealType) => Promise<boolean>;
    /** Additional CSS classes */
    className?: string;
}

// ============================================================================
// Constants
// ============================================================================

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

// ============================================================================
// Component
// ============================================================================

export function DietTab({
    entries,
    dailyTotals,
    targetGoals,
    isLoading,
    onAddEntry,
    onUpdateEntry,
    onDeleteEntry,
    className = '',
}: DietTabProps): React.ReactElement {
    // Store state for water tracking
    const {
        waterIntake,
        waterGoal,
        glassSize,
        waterEnabled,
        selectedDate,
        addWater,
    } = useFoodTrackerStore();

    // Local state for modal
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedMealType, setSelectedMealType] = useState<MealType>('breakfast');
    const [editingEntry, setEditingEntry] = useState<FoodEntry | null>(null);

    // Handle add entry button click
    const handleAddEntry = useCallback((mealType: MealType) => {
        setSelectedMealType(mealType);
        setEditingEntry(null);
        setIsModalOpen(true);
    }, []);

    // Handle entry click (for editing)
    const handleEntryClick = useCallback((entry: FoodEntry) => {
        setEditingEntry(entry);
        setSelectedMealType(entry.mealType);
        setIsModalOpen(true);
    }, []);

    // Handle entry edit
    const handleEditEntry = useCallback((entry: FoodEntry) => {
        setEditingEntry(entry);
        setSelectedMealType(entry.mealType);
        setIsModalOpen(true);
    }, []);

    // Handle entry delete
    const handleDeleteEntry = useCallback(async (entry: FoodEntry) => {
        await onDeleteEntry(entry.id, entry.mealType);
    }, [onDeleteEntry]);

    // Handle modal close
    const handleModalClose = useCallback(() => {
        setIsModalOpen(false);
        setEditingEntry(null);
    }, []);

    // Handle add water
    const handleAddWater = useCallback(() => {
        addWater(1);
    }, [addWater]);

    // Handle FAB click
    const handleFabClick = useCallback(() => {
        // Default to snack for quick add
        setSelectedMealType('snack');
        setEditingEntry(null);
        setIsModalOpen(true);
    }, []);

    // Create water log object for WaterTracker
    const waterLog: WaterLog = {
        date: selectedDate,
        glasses: waterIntake,
        goal: waterGoal,
        glassSize,
    };

    return (
        <div className={`space-y-3 pb-20 sm:space-y-4 sm:pb-24 ${className}`}>
            {/* КБЖУ Summary */}
            <KBZHUSummary
                current={dailyTotals}
                target={targetGoals}
            />

            {/* Meal Slots - responsive grid on larger screens */}
            <div className="space-y-3 sm:space-y-4 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
                {MEAL_TYPES.map((mealType) => (
                    <MealSlot
                        key={mealType}
                        mealType={mealType}
                        entries={entries[mealType]}
                        onAddEntry={handleAddEntry}
                        onEntryClick={handleEntryClick}
                        onEditEntry={handleEditEntry}
                        onDeleteEntry={handleDeleteEntry}
                    />
                ))}
            </div>

            {/* Water Tracker */}
            {waterEnabled && (
                <WaterTracker
                    waterLog={waterLog}
                    onAddGlass={handleAddWater}
                    isLoading={isLoading}
                />
            )}

            {/* Floating Action Button - responsive positioning */}
            <button
                type="button"
                onClick={handleFabClick}
                className="fixed bottom-4 right-4 w-12 h-12 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 active:scale-95 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 flex items-center justify-center z-50 sm:bottom-6 sm:right-6 sm:w-14 sm:h-14 touch-manipulation"
                aria-label="Добавить еду"
                data-testid="fab-add-food"
            >
                <Plus className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>

            {/* Food Entry Modal */}
            <FoodEntryModal
                isOpen={isModalOpen}
                onClose={handleModalClose}
                mealType={selectedMealType}
                editingEntry={editingEntry}
            />

            {/* Loading Overlay */}
            {isLoading && (
                <div
                    className="fixed inset-0 bg-white/50 flex items-center justify-center z-40"
                    aria-live="polite"
                    aria-busy="true"
                >
                    <div className="flex flex-col items-center gap-2">
                        <div className="w-6 h-6 border-3 border-blue-600 border-t-transparent rounded-full animate-spin sm:w-8 sm:h-8 sm:border-4" />
                        <span className="text-xs text-gray-600 sm:text-sm">Загрузка...</span>
                    </div>
                </div>
            )}
        </div>
    );
}

export default DietTab;
