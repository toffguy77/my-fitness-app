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
import { t } from '@/shared/i18n';
import { IconButton } from '@/shared/components/ui/Button';

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
            return t('units.gram');
        case 'milliliters':
            return t('units.milliliter');
        case 'portion':
            return t('foodTracker.entry.unitPortion');
        default:
            return t('units.gram');
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
        return t('foodTracker.entry.calories', { calories: Math.round(entry.nutrition.calories) });
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
            className={`group flex min-h-14 items-center justify-between py-2.5 cursor-pointer transition-colors hover:bg-subtle/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus ${className}`}
            aria-label={ariaLabel}
        >
            {/* Food info */}
            <div className="flex-1 min-w-0">
                <p className="truncate text-base font-medium text-fg">
                    {entry.foodName}
                </p>
                <p className="text-[13px] text-fg-muted tabular-nums">
                    {portionDisplay}
                    {/* Буква и число макроса не разлучаются при переносе:
                        «У» в конце строки и «10» на следующей не читаются. */}
                    <span aria-hidden="true">
                        {' · '}
                        {t('macros.proteinShort')}{'\u00A0'}{Math.round(entry.nutrition.protein)}{' '}
                        {t('macros.fatShort')}{'\u00A0'}{Math.round(entry.nutrition.fat)}{' '}
                        {t('macros.carbsShort')}{'\u00A0'}{Math.round(entry.nutrition.carbs)}
                    </span>
                </p>
            </div>

            {/* Actions and calories */}
            <div className="ml-3 flex items-center gap-1">
                {/* Action buttons (visible on hover) */}
                {(onEdit || onDelete) && (
                    <div
                        className={`flex items-center transition-opacity group-focus-within:opacity-100 ${showActions ? 'opacity-100' : 'opacity-0'
                            }`}
                    >
                        {onEdit && (
                            <IconButton
                                variant="ghost"
                                onClick={handleEdit}
                                className="text-fg-subtle hover:text-fg"
                                aria-label={t('foodTracker.entry.editAria', { name: entry.foodName })}
                            >
                                <Edit2 className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                            </IconButton>
                        )}
                        {onDelete && (
                            <IconButton
                                variant="ghost"
                                onClick={handleDelete}
                                className="text-fg-subtle hover:bg-danger-soft hover:text-danger-fg"
                                aria-label={t('foodTracker.entry.deleteAria', { name: entry.foodName })}
                            >
                                <Trash2 className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                            </IconButton>
                        )}
                    </div>
                )}

                {/* Calories */}
                <div className="min-w-[64px] text-right">
                    <p className="text-[15px] font-medium text-fg-muted tabular-nums">
                        {caloriesDisplay}
                    </p>
                </div>
            </div>
        </div>
    );
}

export default FoodEntryItem;
