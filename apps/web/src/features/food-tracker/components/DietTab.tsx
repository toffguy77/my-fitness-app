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
import type { MealType, FoodEntry, WaterLog, EntryMethodTab } from '../types';
import { CalculateTargetPrompt } from '@/features/nutrition-calc/components/CalculateTargetPrompt';
import type { MissingTargetInputs } from '@/features/nutrition-calc/types';
import { t } from '@/shared/i18n';

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
    /** Норма КБЖУ, или null — посчитать её не из чего. */
    targetGoals: {
        calories: number;
        protein: number;
        fat: number;
        carbs: number;
    } | null;
    /**
     * Чего не хватает для расчёта нормы, когда её нет. Необязательно: при
     * заданной норме приглашение не показывается, и знать нечего.
     */
    missingTargetInputs?: MissingTargetInputs | null;
    /** Loading state */
    isLoading: boolean;
    /** Callback to delete an entry */
    onDeleteEntry: (id: string, mealType: MealType) => Promise<boolean>;
    /**
     * Вкладка окна записи, на которой его следует открыть сразу при появлении
     * вкладки рациона. Пусто — окно не открывается само.
     */
    openEntryOn?: EntryMethodTab | null;
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
    missingTargetInputs = null,
    isLoading,
    onDeleteEntry,
    openEntryOn = null,
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
    const [isModalOpen, setIsModalOpen] = useState(openEntryOn !== null);

    // Ссылка вида /food-tracker?add=photo должна привести прямо к распознаванию.
    // Начальное состояние выше берёт указание сразу, поэтому окно открывается
    // первым же рендером, а не эффектом после него.
    
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
            {/* КБЖУ Summary. Без нормы сводка показывает съеденное числом, а
                рядом стоит приглашение её посчитать — вместо придуманных цифр. */}
            <KBZHUSummary
                current={dailyTotals}
                target={targetGoals}
            />

            {!targetGoals && <CalculateTargetPrompt missing={missingTargetInputs} />}

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
                // The footer navigation is a fixed 64px bar at the bottom of
                // every signed-in page. At bottom-4 this button sat entirely
                // behind it: visible in a screenshot, but every tap landed on
                // the nav instead.
                className="fixed bottom-20 right-4 w-12 h-12 bg-primary text-on-primary rounded-full shadow-lg hover:bg-primary-hover active:scale-95 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 flex items-center justify-center z-50 sm:bottom-24 sm:right-6 sm:w-14 sm:h-14 touch-manipulation"
                aria-label={t('foodTracker.page.addFoodAria')}
                data-testid="fab-add-food"
            >
                <Plus className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>

            {/* Food Entry Modal */}
            {/* Keyed on what it is editing: opening the modal remounts it, so
                its state starts correct instead of being corrected by an
                effect after the first render. */}
            <FoodEntryModal
                key={isModalOpen ? (editingEntry?.id ?? `new-${selectedMealType}`) : 'closed'}
                isOpen={isModalOpen}
                onClose={handleModalClose}
                mealType={selectedMealType}
                editingEntry={editingEntry}
                initialTab={openEntryOn ?? undefined}
            />

            {/* Loading Overlay */}
            {isLoading && (
                <div
                    className="fixed inset-0 bg-surface/50 flex items-center justify-center z-40"
                    aria-live="polite"
                    aria-busy="true"
                >
                    <div className="flex flex-col items-center gap-2">
                        <div className="w-6 h-6 border-3 border-primary border-t-transparent rounded-full animate-spin sm:w-8 sm:h-8 sm:border-4" />
                        <span className="text-xs text-fg-muted sm:text-sm">{t('common.loading')}</span>
                    </div>
                </div>
            )}
        </div>
    );
}

export default DietTab;
