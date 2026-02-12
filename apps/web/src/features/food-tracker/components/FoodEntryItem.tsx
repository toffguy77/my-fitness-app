'use client';

/**
 * FoodEntryItem Component
 *
 * Displays a single food entry with name, portion size, and calories.
 * Supports click, edit, and delete actions.
 *
 * @module food-tracker/components/FoodEntryItem
 */

import { useMemo, useState, useCallback } from 'react';
import { Edit2, Trash2 } from 'lucide-react';
import type { FoodEntry } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface FoodEntryItemProps {
    /** Food entry data */
    entry: FoodEntry;
    /** Callback when entry is clicked for details */
    onClick?: (entry: FoodEntry) => void;
    /** Callback when edit is requested */
    onEdit?: (entry: FoodEntry) => void;
    /** Callback when delete is requested */
    onDelete?: (entry: FoodEntry) => void;
    /** Enable swipe actions for mobile */
    enableSwipe?: boolean;
    /** Additional CSS classes */
    className?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get Russian unit label for portion type
 */
function getPortionUnit(portionType: string): string {
    switch (portionType) {
        case 'grams':
            return 'г';
        case 'milliliters':
            return 'мл';
        case 'portion':
            return 'порц.';
        default:
            return 'г';
    }
}

// ============================================================================
// Component
// ============================================================================

export function FoodEntryItem({
    entry,
    onClick,
    onEdit,
    onDelete,
    enableSwipe = false,
    className = '',
}: FoodEntryItemProps) {
    const [showActions, setShowActions] = useState(false);

    // Handle click
    const handleClick = useCallback(() => {
        onClick?.(entry);
    }, [onClick, entry]);

    // Handle keyboard navigation
    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick?.(entry);
            }
        },
        [onClick, entry]
    );

    // Handle edit
    const handleEdit = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation();
            onEdit?.(entry);
        },
        [onEdit, entry]
    );

    // Handle delete
    const handleDelete = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation();
            onDelete?.(entry);
        },
        [onDelete, entry]
    );

    // Format portion display
    const portionDisplay = useMemo(() => {
        const unit = getPortionUnit(entry.portionType);
        return `${Math.round(entry.portionAmount)} ${unit}`;
    }, [entry.portionAmount, entry.portionType]);

    // Format calories display
    const caloriesDisplay = useMemo(() => {
        return `${Math.round(entry.nutrition.calories)} ккал`;
    }, [entry.nutrition.calories]);

    // Aria label for accessibility
    const ariaLabel = `${entry.foodName}, ${portionDisplay}, ${caloriesDisplay}`;

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            onMouseEnter={() => setShowActions(true)}
            onMouseLeave={() => setShowActions(false)}
            className={`group flex items-center justify-between py-3 px-2 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${className}`}
            aria-label={ariaLabel}
        >
            {/* Food info */}
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                    {entry.foodName}
                </p>
                <p className="text-xs text-gray-500">
                    {portionDisplay}
                </p>
            </div>

            {/* Actions and calories */}
            <div className="flex items-center gap-2 ml-4">
                {/* Action buttons (visible on hover) */}
                {(onEdit || onDelete) && (
                    <div
                        className={`flex items-center gap-1 transition-opacity ${showActions ? 'opacity-100' : 'opacity-0'
                            }`}
                    >
                        {onEdit && (
                            <button
                                type="button"
                                onClick={handleEdit}
                                className="p-1.5 rounded-full text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                aria-label={`Редактировать ${entry.foodName}`}
                            >
                                <Edit2 className="w-4 h-4" />
                            </button>
                        )}
                        {onDelete && (
                            <button
                                type="button"
                                onClick={handleDelete}
                                className="p-1.5 rounded-full text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                                aria-label={`Удалить ${entry.foodName}`}
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                )}

                {/* Calories */}
                <div className="text-right min-w-[70px]">
                    <p className="text-sm font-semibold text-gray-900">
                        {caloriesDisplay}
                    </p>
                </div>
            </div>
        </div>
    );
}

export default FoodEntryItem;
