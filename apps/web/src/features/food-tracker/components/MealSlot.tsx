'use client';

/**
 * MealSlot Component
 *
 * Displays a meal slot (Завтрак, Обед, Ужин, Перекус) with food entries,
 * subtotals, and add button.
 *
 * @module food-tracker/components/MealSlot
 */

import { useMemo } from 'react';
import { Plus, Sunrise, Sun, Moon, Cookie } from 'lucide-react';
import type { MealType, FoodEntry, KBZHU } from '../types';
import { getMealSlotLabel, calculateSlotSubtotal, getFirstEntryTime } from '../utils/mealSlotUtils';

// ============================================================================
// Types
// ============================================================================

export interface MealSlotProps {
    /** Meal type (breakfast, lunch, dinner, snack) */
    mealType: MealType;
    /** Food entries for this meal slot */
    entries: FoodEntry[];
    /** Callback when add button is clicked */
    onAddEntry: (mealType: MealType) => void;
    /** Callback when an entry is clicked */
    onEntryClick?: (entry: FoodEntry) => void;
    /** Callback when edit is requested */
    onEditEntry?: (entry: FoodEntry) => void;
    /** Callback when delete is requested */
    onDeleteEntry?: (entry: FoodEntry) => void;
    /** Additional CSS classes */
    className?: string;
}

// ============================================================================
// Icon Component
// ============================================================================

interface MealIconProps {
    mealType: MealType;
    className?: string;
}

function MealIcon({ mealType, className = '' }: MealIconProps) {
    // Default size classes are handled by parent, just pass through className
    switch (mealType) {
        case 'breakfast':
            return <Sunrise className={className} aria-hidden="true" />;
        case 'lunch':
            return <Sun className={className} aria-hidden="true" />;
        case 'dinner':
            return <Moon className={className} aria-hidden="true" />;
        case 'snack':
        default:
            return <Cookie className={className} aria-hidden="true" />;
    }
}

// ============================================================================
// Food Entry Item Component
// ============================================================================

interface FoodEntryItemProps {
    entry: FoodEntry;
    onClick?: (entry: FoodEntry) => void;
    onEdit?: (entry: FoodEntry) => void;
    onDelete?: (entry: FoodEntry) => void;
}

function FoodEntryItem({ entry, onClick, onEdit, onDelete }: FoodEntryItemProps) {
    const handleClick = () => {
        onClick?.(entry);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick?.(entry);
        }
    };

    // Format portion display
    const portionDisplay = useMemo(() => {
        const unit = entry.portionType === 'grams' ? 'г' :
            entry.portionType === 'milliliters' ? 'мл' : 'порц.';
        return `${Math.round(entry.portionAmount)} ${unit}`;
    }, [entry.portionAmount, entry.portionType]);

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            className="flex items-center justify-between py-2.5 px-1.5 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:py-3 sm:px-2 touch-manipulation"
            aria-label={`${entry.foodName}, ${portionDisplay}, ${Math.round(entry.nutrition.calories)} ккал`}
        >
            <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-900 truncate sm:text-sm">
                    {entry.foodName}
                </p>
                <p className="text-[10px] text-gray-500 sm:text-xs">
                    {portionDisplay}
                </p>
            </div>
            <div className="ml-3 text-right sm:ml-4">
                <p className="text-xs font-semibold text-gray-900 sm:text-sm">
                    {Math.round(entry.nutrition.calories)} ккал
                </p>
            </div>
        </div>
    );
}

// ============================================================================
// Subtotal Display Component
// ============================================================================

interface SubtotalDisplayProps {
    subtotal: KBZHU;
}

function SubtotalDisplay({ subtotal }: SubtotalDisplayProps) {
    return (
        <div className="flex flex-wrap items-center gap-2 text-[10px] text-gray-500 mt-2 pt-2 border-t border-gray-100 sm:gap-3 sm:text-xs">
            <span className="font-medium">Итого:</span>
            <span>{Math.round(subtotal.calories)} ккал</span>
            <span className="text-gray-300 hidden sm:inline">|</span>
            <span>Б: {Math.round(subtotal.protein)}г</span>
            <span>Ж: {Math.round(subtotal.fat)}г</span>
            <span>У: {Math.round(subtotal.carbs)}г</span>
        </div>
    );
}

// ============================================================================
// Main Component
// ============================================================================

export function MealSlot({
    mealType,
    entries,
    onAddEntry,
    onEntryClick,
    onEditEntry,
    onDeleteEntry,
    className = '',
}: MealSlotProps) {
    // Calculate subtotals
    const subtotal = useMemo(() => calculateSlotSubtotal(entries), [entries]);

    // Get first entry time
    const firstTime = useMemo(() => getFirstEntryTime(entries), [entries]);

    // Get Russian label
    const label = getMealSlotLabel(mealType);

    // Check if slot has entries
    const hasEntries = entries.length > 0;

    return (
        <section
            className={`bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden ${className}`}
            aria-label={`${label} - приём пищи`}
        >
            {/* Header - responsive padding */}
            <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50 border-b border-gray-100 sm:px-4 sm:py-3">
                <div className="flex items-center gap-2 sm:gap-3">
                    <MealIcon mealType={mealType} className="text-gray-600 w-4 h-4 sm:w-5 sm:h-5" />
                    <div>
                        <h3 className="text-xs font-semibold text-gray-900 sm:text-sm">{label}</h3>
                        {firstTime && (
                            <p className="text-[10px] text-gray-500 sm:text-xs">{firstTime}</p>
                        )}
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => onAddEntry(mealType)}
                    className="p-1.5 rounded-full bg-blue-500 text-white hover:bg-blue-600 active:scale-95 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:p-2 touch-manipulation"
                    aria-label={`Добавить в ${label}`}
                >
                    <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>
            </div>

            {/* Content - responsive padding */}
            <div className="px-3 py-2 sm:px-4">
                {hasEntries ? (
                    <>
                        {/* Entry list */}
                        <div className="divide-y divide-gray-100">
                            {entries.map((entry) => (
                                <FoodEntryItem
                                    key={entry.id}
                                    entry={entry}
                                    onClick={onEntryClick}
                                    onEdit={onEditEntry}
                                    onDelete={onDeleteEntry}
                                />
                            ))}
                        </div>

                        {/* Subtotals - responsive text */}
                        <SubtotalDisplay subtotal={subtotal} />
                    </>
                ) : (
                    /* Empty state */
                    <div className="py-4 text-center sm:py-6">
                        <p className="text-xs text-gray-400 sm:text-sm">
                            Нет записей
                        </p>
                        <button
                            type="button"
                            onClick={() => onAddEntry(mealType)}
                            className="mt-1.5 text-xs text-blue-500 hover:text-blue-600 font-medium focus:outline-none focus-visible:underline sm:mt-2 sm:text-sm touch-manipulation"
                        >
                            Добавить еду
                        </button>
                    </div>
                )}
            </div>
        </section>
    );
}

export default MealSlot;
